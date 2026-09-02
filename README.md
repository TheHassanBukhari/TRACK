# TRACK

### Tracking Records And Criminal Knowledge

TRACK is a database driven crime management system for managing criminal records, FIRs, investigations, evidence, victims, and officers. The project supports both Oracle XE (SQL) and MongoDB (NoSQL) through a unified web interface.

**Project Type:** University Project (Group) <br>
**Course:** Database Systems, 3rd Semester, COMSATS University Islamabad

**Portfolio:** [hassanbukhari.is-a.dev](https://hassanbukhari.is-a.dev/) <br>
**LinkedIn:** [Syed Hassan Ali Bukhari](https://www.linkedin.com/in/syedhassanalibukhari/)

## Features

- Role based access control
- Criminal record management
- FIR and case tracking
- Evidence management
- Victim registry
- Officer management
- Custom SQL and MongoDB query execution
- Oracle XE and MongoDB support

## Tech Stack

- Node.js
- Express.js
- Oracle XE 21c
- MongoDB
- HTML, CSS, JavaScript
- Docker (optional)

## Requirements

- Node.js 20+
- Oracle XE 21c
- Oracle Instant Client
- MongoDB 7+ (or Docker)
- npm

### Node Dependencies

```bash
npm install express mongodb oracledb cors
```

## Project Structure

```text
TRACK/
├── webapp/
├── sql/
├── mongo/
├── setup/
├── Documentation.pdf
├── start.sh
└── README.md
```

## Setup

### Clone Repository

```bash
git clone https://github.com/TheHassanBukhari/TRACK.git
cd TRACK
```

### Install Dependencies

```bash
cd webapp
npm install
```

### Oracle Setup

Run the scripts in order:

```text
sql/create.txt
sql/tables.txt
sql/data.txt
```

### MongoDB Setup

Create the database and run:

```text
mongo/mongo_create_tables.txt
```

### Run Application

```bash
cd webapp
node server.js
```

Open `http://localhost:3000/login.html`

## Default Login

| Role | ID |
|------|----|
| Admin | 1 |
| Admin | 4 |
| Regular Officer | 2 |
| Regular Officer | 3 |
| Regular Officer | 5 |

## API Examples

```http
POST /api/login
GET  /api/oracle/stats
GET  /api/mongo/stats
GET  /api/:db/cases/all
POST /api/:db/cases/create
```

## Future Improvements

- Mobile application
- Audit logging
- PDF report generation
- Real time notifications
- Advanced search

## Team

Developed by [Syed Hassan Ali Bukhari](https://hassanbukhari.is-a.dev/) ([GitHub](https://github.com/TheHassanBukhari)) and [Munnazah Noor](https://github.com/munnazahnoor-10102005).

## License

This project is licensed under the [MIT License](./LICENSE).
