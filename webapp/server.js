const express = require('express');
const cors = require('cors');
const oracledb = require('oracledb');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let oraclePool;
let mongoClient;
let mongoDb;

async function initOracle() {
    try {
        oraclePool = await oracledb.createPool({
            user: 'track',
            password: 'track123',
            connectString: 'localhost:1521/XEPDB1'
        });
        console.log('✓ Oracle connected');
    } catch (err) {
        console.error('✗ Oracle connection failed:', err);
    }
}

async function initMongo() {
    try {
        mongoClient = new MongoClient('mongodb://admin:admin123@localhost:27017');
        await mongoClient.connect();
        mongoDb = mongoClient.db('track');
        console.log('✓ MongoDB connected');
    } catch (err) {
        console.error('✗ MongoDB connection failed:', err);
    }
}

function rowsToObjects(rows, metaData) {
    if (!rows || rows.length === 0) return [];
    return rows.map(row => {
        let obj = {};
        metaData.forEach((col, idx) => {
            obj[col.name] = row[idx];
        });
        return obj;
    });
}

app.post('/api/login', async (req, res) => {
    const { officer_id, password } = req.body;
    
    let expectedPassword;
    if (officer_id == 1) expectedPassword = 'admin123';
    else if (officer_id == 2 || officer_id == 3 || officer_id == 5) expectedPassword = 'regular123';
    else expectedPassword = null;
    
    if (password !== expectedPassword) {
        return res.status(401).json({ error: 'Invalid Officer ID or Password' });
    }
    
    try {
        const conn = await oraclePool.getConnection();
        const result = await conn.execute(
            'SELECT OFFICER_ID, FIRST_NAME, LAST_NAME, ROLE, RANK FROM OFFICER WHERE OFFICER_ID = :id',
            [officer_id]
        );
        await conn.close();
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Officer not found' });
        }
        
        const officer = rowsToObjects(result.rows, result.metaData)[0];
        res.json({
            officer_id: officer.OFFICER_ID,
            first_name: officer.FIRST_NAME,
            last_name: officer.LAST_NAME,
            role: officer.ROLE,
            rank: officer.RANK
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/:db/stats', async (req, res) => {
    const { db } = req.params;
    
    try {
        if (db === 'oracle') {
            const conn = await oraclePool.getConnection();
            const officers = await conn.execute('SELECT COUNT(*) FROM OFFICER');
            const criminals = await conn.execute('SELECT COUNT(*) FROM CRIMINAL');
            const cases = await conn.execute('SELECT COUNT(*) FROM CASES');
            const evidence = await conn.execute('SELECT COUNT(*) FROM EVIDENCE');
            await conn.close();
            
            res.json({
                officers: officers.rows[0][0],
                criminals: criminals.rows[0][0],
                cases: cases.rows[0][0],
                evidence: evidence.rows[0][0]
            });
        } else {
            const officers = await mongoDb.collection('officer').countDocuments();
            const criminals = await mongoDb.collection('criminal').countDocuments();
            const cases = await mongoDb.collection('cases').countDocuments();
            const evidence = await mongoDb.collection('evidence').countDocuments();
            
            res.json({ officers, criminals, cases, evidence });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/:db/cases/all', async (req, res) => {
    const { db } = req.params;
    
    try {
        if (db === 'oracle') {
            const conn = await oraclePool.getConnection();
            const result = await conn.execute('SELECT * FROM CASES ORDER BY CASE_ID');
            await conn.close();
            res.json(rowsToObjects(result.rows, result.metaData));
        } else {
            const cases = await mongoDb.collection('cases').find().sort({ case_id: 1 }).toArray();
            res.json(cases);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/:db/cases/my/:officerId', async (req, res) => {
    const { db, officerId } = req.params;
    
    try {
        if (db === 'oracle') {
            const conn = await oraclePool.getConnection();
            const result = await conn.execute(
                `SELECT c.* FROM CASES c 
                 JOIN FIR f ON c.FIR_ID = f.FIR_ID 
                 WHERE f.OFFICER_ID = :id
                 ORDER BY c.CASE_ID`,
                [officerId]
            );
            await conn.close();
            res.json(rowsToObjects(result.rows, result.metaData));
        } else {
            const firs = await mongoDb.collection('fir').find({ officer_id: parseInt(officerId) }).toArray();
            const firIds = firs.map(f => f.fir_id);
            const cases = await mongoDb.collection('cases').find({ fir_id: { $in: firIds } }).sort({ case_id: 1 }).toArray();
            res.json(cases);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/:db/cases/create', async (req, res) => {
    const { db } = req.params;
    const { title, fir_id, status, officer_id } = req.body;
    
    try {
        if (db === 'oracle') {
            const conn = await oraclePool.getConnection();
            const maxResult = await conn.execute('SELECT MAX(CASE_ID) FROM CASES');
            const currentMax = maxResult.rows[0][0] || 0;
            const newCaseId = currentMax + 1;
            
            await conn.execute(
                `INSERT INTO CASES (CASE_ID, C_TITLE, OPEN_DATE, C_STATUS, FIR_ID) 
                 VALUES (:id, :title, SYSDATE, :cstatus, :fir_id)`,
                [newCaseId, title, status, fir_id]
            );
            await conn.commit();
            await conn.close();
            res.json({ success: true, case_id: newCaseId });
        } else {
            const cases = mongoDb.collection('cases');
            const maxId = await cases.find().sort({ case_id: -1 }).limit(1).toArray();
            const newId = maxId.length > 0 ? maxId[0].case_id + 1 : 6;
            
            await cases.insertOne({
                case_id: newId,
                c_title: title,
                open_date: new Date(),
                close_date: null,
                c_status: status,
                fir_id: parseInt(fir_id)
            });
            res.json({ success: true, case_id: newId });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/:db/cases/update/:caseId', async (req, res) => {
    const { db, caseId } = req.params;
    const { status } = req.body;
    
    try {
        if (db === 'oracle') {
            const conn = await oraclePool.getConnection();
            await conn.execute(
                `UPDATE CASES SET C_STATUS = :cstatus WHERE CASE_ID = :id`,
                [status, caseId]
            );
            await conn.commit();
            await conn.close();
            res.json({ success: true });
        } else {
            await mongoDb.collection('cases').updateOne(
                { case_id: parseInt(caseId) },
                { $set: { c_status: status } }
            );
            res.json({ success: true });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/:db/cases/delete/:caseId', async (req, res) => {
    const { db, caseId } = req.params;
    
    try {
        if (db === 'oracle') {
            const conn = await oraclePool.getConnection();
            await conn.execute(`DELETE FROM CASES WHERE CASE_ID = :id`, [caseId]);
            await conn.commit();
            await conn.close();
            res.json({ success: true });
        } else {
            await mongoDb.collection('cases').deleteOne({ case_id: parseInt(caseId) });
            res.json({ success: true });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/:db/criminals', async (req, res) => {
    const { db } = req.params;
    
    try {
        if (db === 'oracle') {
            const conn = await oraclePool.getConnection();
            const result = await conn.execute('SELECT * FROM CRIMINAL ORDER BY CR_ID');
            await conn.close();
            res.json(rowsToObjects(result.rows, result.metaData));
        } else {
            const criminals = await mongoDb.collection('criminal').find().sort({ cr_id: 1 }).toArray();
            res.json(criminals);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/:db/criminals/create', async (req, res) => {
    const { db } = req.params;
    const { first_name, last_name, gender, status, city, district, street, dob } = req.body;
    
    try {
        if (db === 'oracle') {
            const conn = await oraclePool.getConnection();
            await conn.execute(
                `INSERT INTO CRIMINAL (FIRST_NAME, LAST_NAME, GENDER, STATUS, CITY, DISTRICT, STREET, DOB) 
                 VALUES (:fn, :ln, :gen, :stat, :city, :dist, :street, TO_DATE(:dob, 'YYYY-MM-DD'))`,
                [first_name, last_name, gender, status, city, district, street, dob]
            );
            await conn.commit();
            await conn.close();
            res.json({ success: true });
        } else {
            const criminal = mongoDb.collection('criminal');
            const maxId = await criminal.find().sort({ cr_id: -1 }).limit(1).toArray();
            const newId = maxId.length > 0 ? maxId[0].cr_id + 1 : 6;
            
            await criminal.insertOne({
                cr_id: newId,
                first_name, last_name, gender, status, city, district, street,
                dob: dob ? new Date(dob) : null
            });
            res.json({ success: true });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/:db/criminals/update/:criminalId', async (req, res) => {
    const { db, criminalId } = req.params;
    const { status } = req.body;
    
    try {
        if (db === 'oracle') {
            const conn = await oraclePool.getConnection();
            await conn.execute(`UPDATE CRIMINAL SET STATUS = :status WHERE CR_ID = :id`, [status, criminalId]);
            await conn.commit();
            await conn.close();
            res.json({ success: true });
        } else {
            await mongoDb.collection('criminal').updateOne(
                { cr_id: parseInt(criminalId) },
                { $set: { status: status } }
            );
            res.json({ success: true });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/:db/criminals/delete/:criminalId', async (req, res) => {
    const { db, criminalId } = req.params;
    
    try {
        if (db === 'oracle') {
            const conn = await oraclePool.getConnection();
            await conn.execute(`DELETE FROM CRIMINAL WHERE CR_ID = :id`, [criminalId]);
            await conn.commit();
            await conn.close();
            res.json({ success: true });
        } else {
            await mongoDb.collection('criminal').deleteOne({ cr_id: parseInt(criminalId) });
            res.json({ success: true });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/:db/fir', async (req, res) => {
    const { db } = req.params;
    
    try {
        if (db === 'oracle') {
            const conn = await oraclePool.getConnection();
            const result = await conn.execute('SELECT * FROM FIR ORDER BY FIR_ID');
            await conn.close();
            res.json(rowsToObjects(result.rows, result.metaData));
        } else {
            const firs = await mongoDb.collection('fir').find().sort({ fir_id: 1 }).toArray();
            res.json(firs);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/:db/fir/create', async (req, res) => {
    const { db } = req.params;
    const { fir_no, descr, officer_id } = req.body;
    
    try {
        if (db === 'oracle') {
            const conn = await oraclePool.getConnection();
            const maxResult = await conn.execute('SELECT MAX(FIR_ID) FROM FIR');
            const currentMax = maxResult.rows[0][0] || 0;
            const newFirId = currentMax + 1;
            
            await conn.execute(
                `INSERT INTO FIR (FIR_ID, FIR_NO, FIR_DATE, DESCR, OFFICER_ID) 
                 VALUES (:id, :no, SYSDATE, :descr, :oid)`,
                [newFirId, fir_no, descr, officer_id]
            );
            await conn.commit();
            await conn.close();
            res.json({ success: true, fir_id: newFirId });
        } else {
            const fir = mongoDb.collection('fir');
            const maxId = await fir.find().sort({ fir_id: -1 }).limit(1).toArray();
            const newId = maxId.length > 0 ? maxId[0].fir_id + 1 : 6;
            
            await fir.insertOne({
                fir_id: newId,
                fir_no: fir_no,
                fir_date: new Date(),
                descr: descr,
                officer_id: parseInt(officer_id)
            });
            res.json({ success: true, fir_id: newId });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/:db/evidence', async (req, res) => {
    const { db } = req.params;
    
    try {
        if (db === 'oracle') {
            const conn = await oraclePool.getConnection();
            const result = await conn.execute('SELECT * FROM EVIDENCE ORDER BY CASE_ID, EVID_ID');
            await conn.close();
            res.json(rowsToObjects(result.rows, result.metaData));
        } else {
            const evidence = await mongoDb.collection('evidence').find().sort({ case_id: 1, evid_id: 1 }).toArray();
            res.json(evidence);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/:db/evidence/create', async (req, res) => {
    const { db } = req.params;
    const { case_id, e_desc, evid_type } = req.body;
    
    try {
        if (db === 'oracle') {
            const conn = await oraclePool.getConnection();
            const maxResult = await conn.execute(
                `SELECT MAX(EVID_ID) FROM EVIDENCE WHERE CASE_ID = :cid`,
                [case_id]
            );
            const nextId = (maxResult.rows[0][0] || 0) + 1;
            
            await conn.execute(
                `INSERT INTO EVIDENCE (CASE_ID, EVID_ID, E_DESC, COLLECTED_DATE, EVID_TYPE) 
                 VALUES (:cid, :eid, :edescr, SYSDATE, :etype)`,
                [case_id, nextId, e_desc, evid_type]
            );
            await conn.commit();
            await conn.close();
            res.json({ success: true });
        } else {
            const evidence = mongoDb.collection('evidence');
            const maxId = await evidence.find({ case_id: parseInt(case_id) }).sort({ evid_id: -1 }).limit(1).toArray();
            const nextId = maxId.length > 0 ? maxId[0].evid_id + 1 : 1;
            
            await evidence.insertOne({
                case_id: parseInt(case_id),
                evid_id: nextId,
                e_desc: e_desc,
                collected_date: new Date(),
                evid_type: evid_type
            });
            res.json({ success: true });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/:db/victims', async (req, res) => {
    const { db } = req.params;
    
    try {
        if (db === 'oracle') {
            const conn = await oraclePool.getConnection();
            const result = await conn.execute(`
                SELECT v.*, vc.CONTACT_NO 
                FROM VICTIMS v 
                LEFT JOIN VICTIM_CONTACT vc ON v.VICTIM_ID = vc.VICTIM_ID
                ORDER BY v.VICTIM_ID
            `);
            await conn.close();
            res.json(rowsToObjects(result.rows, result.metaData));
        } else {
            const victims = await mongoDb.collection('victims').find().sort({ victim_id: 1 }).toArray();
            const contacts = await mongoDb.collection('victim_contact').find().toArray();
            
            const victimsWithContacts = victims.map(v => ({
                ...v,
                CONTACT_NO: contacts.find(c => c.victim_id === v.victim_id)?.contact_no
            }));
            res.json(victimsWithContacts);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/:db/officers', async (req, res) => {
    const { db } = req.params;
    
    try {
        if (db === 'oracle') {
            const conn = await oraclePool.getConnection();
            const result = await conn.execute('SELECT OFFICER_ID, FIRST_NAME, LAST_NAME, ROLE, RANK, GENDER FROM OFFICER ORDER BY OFFICER_ID');
            await conn.close();
            res.json(rowsToObjects(result.rows, result.metaData));
        } else {
            const officers = await mongoDb.collection('officer').find().sort({ officer_id: 1 }).toArray();
            res.json(officers);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/:db/officers/create', async (req, res) => {
    const { db } = req.params;
    const { first_name, last_name, role, rank, gender, hire_date } = req.body;
    
    if (req.headers['x-user-role'] !== 'Admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
        if (db === 'oracle') {
            const conn = await oraclePool.getConnection();
            const maxResult = await conn.execute('SELECT MAX(OFFICER_ID) FROM OFFICER');
            const currentMax = maxResult.rows[0][0] || 0;
            const newOfficerId = currentMax + 1;
            
            await conn.execute(
                `INSERT INTO OFFICER (OFFICER_ID, FIRST_NAME, LAST_NAME, HIRE_DATE, ROLE, RANK, GENDER) 
                 VALUES (:id, :fn, :ln, TO_DATE(:hd, 'YYYY-MM-DD'), :role, :rank, :gender)`,
                [newOfficerId, first_name, last_name, hire_date, role, rank, gender]
            );
            await conn.commit();
            await conn.close();
            res.json({ success: true, officer_id: newOfficerId });
        } else {
            const officer = mongoDb.collection('officer');
            const maxId = await officer.find().sort({ officer_id: -1 }).limit(1).toArray();
            const newId = maxId.length > 0 ? maxId[0].officer_id + 1 : 6;
            
            await officer.insertOne({
                officer_id: newId,
                first_name, last_name, role, rank, gender,
                hire_date: hire_date ? new Date(hire_date) : new Date()
            });
            res.json({ success: true, officer_id: newId });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/:db/officers/delete/:officerId', async (req, res) => {
    const { db, officerId } = req.params;
    
    if (req.headers['x-user-role'] !== 'Admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
        if (db === 'oracle') {
            const conn = await oraclePool.getConnection();
            await conn.execute(`DELETE FROM OFFICER WHERE OFFICER_ID = :id`, [officerId]);
            await conn.commit();
            await conn.close();
            res.json({ success: true });
        } else {
            await mongoDb.collection('officer').deleteOne({ officer_id: parseInt(officerId) });
            res.json({ success: true });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/:db/query', async (req, res) => {
    const { db } = req.params;
    const { collection, operation, filter, update, projection, sort, limit, query } = req.body;
    
    if (req.headers['x-user-role'] !== 'Admin') {
        return res.status(403).json({ error: 'Admin access required for custom queries' });
    }
    
    try {
        if (db === 'oracle') {
            const conn = await oraclePool.getConnection();
            const result = await conn.execute(query);
            await conn.commit();
            await conn.close();
            
            const queryUpper = query.trim().toUpperCase();
            if (queryUpper.startsWith('SELECT')) {
                const data = rowsToObjects(result.rows, result.metaData);
                const columns = result.metaData.map(col => col.name);
                res.json({ type: 'select', data: data, columns: columns });
            } else {
                res.json({ type: 'non-select', message: 'Query executed successfully', rowsAffected: result.rowsAffected });
            }
        } else {
            const col = mongoDb.collection(collection);
            let filterObj = {};
            let updateObj = {};
            let projectionObj = {};
            let sortObj = {};
            
            if (filter && filter.trim()) filterObj = JSON.parse(filter);
            if (update && update.trim()) updateObj = JSON.parse(update);
            if (projection && projection.trim()) projectionObj = JSON.parse(projection);
            if (sort && sort.trim()) sortObj = JSON.parse(sort);
            
            if (operation === 'find') {
                let cursor = col.find(filterObj, { projection: projectionObj });
                if (Object.keys(sortObj).length) cursor = cursor.sort(sortObj);
                if (limit) cursor = cursor.limit(parseInt(limit));
                const data = await cursor.toArray();
                res.json({ type: 'find', data: data, count: data.length });
            }
            else if (operation === 'count') {
                const count = await col.countDocuments(filterObj);
                res.json({ type: 'count', count: count });
            }
            else if (operation === 'aggregate') {
                const pipeline = JSON.parse(filter);
                const data = await col.aggregate(pipeline).toArray();
                res.json({ type: 'aggregate', data: data, count: data.length });
            }
            else if (operation === 'updateOne') {
                const result = await col.updateOne(filterObj, updateObj);
                res.json({ type: 'updateOne', matchedCount: result.matchedCount, modifiedCount: result.modifiedCount });
            }
            else if (operation === 'deleteOne') {
                const result = await col.deleteOne(filterObj);
                res.json({ type: 'deleteOne', deletedCount: result.deletedCount });
            }
            else if (operation === 'deleteMany') {
                const result = await col.deleteMany(filterObj);
                res.json({ type: 'deleteMany', deletedCount: result.deletedCount });
            }
            else {
                res.status(400).json({ error: 'Unknown operation' });
            }
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

async function startServer() {
    await initOracle();
    await initMongo();
    
    app.listen(PORT, () => {
        console.log(`
╔════════════════════════════════════════╗
║     TRACK System Server Started        ║
╠════════════════════════════════════════╣
║  Oracle: Connected                     ║
║  MongoDB: Connected                    ║
║  Server: http://localhost:${PORT}         ║
╚════════════════════════════════════════╝
        `);
    });
}

startServer();
