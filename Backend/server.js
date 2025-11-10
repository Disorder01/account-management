const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const User = require('./models/user');

const app = express();
const PORT = 3000;

app.use(cors());               
app.use(bodyParser.json());    

function getNextUserId(filePath) {
  if (!fs.existsSync(filePath)) return 1;
  const lines = fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter(line => line.trim());
  let maxId = 0;
  for (let i = 1; i < lines.length; i++) {
    const id = parseInt(lines[i].split(',')[0], 10);
    if (id > maxId) maxId = id;
  }
  return maxId + 1;
}

app.post('/api/register', (req, res) => {
  const filePath = path.join(__dirname, 'database', 'users.csv');
  const newId = getNextUserId(filePath);
  const userData = req.body;
  userData.id = newId;
  const user = new User(userData);
  const header = 'id,firstName,lastName,password\n';
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, header, 'utf-8');
  }
  const line = `${user.id},${user.firstName},${user.lastName},${user.password}\n`;
  fs.appendFileSync(filePath, line, 'utf-8');
  res.json({ success: true, user });
});

app.post('/api/login', (req, res) => {
  const filePath = path.join(__dirname, 'database', 'users.csv');
  const { lastName, password } = req.body;
  if (!fs.existsSync(filePath)) {
    return res.json({ success: false });
  }
  const lines = fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter(line => line.trim());
  for (let i = 1; i < lines.length; i++) {
    const [idStr, firstName, currentLastName, currentPassword] = lines[i].split(',');
    if (currentLastName === lastName && currentPassword === password) {
      const user = new User({
        id: parseInt(idStr, 10),
        firstName,
        lastName: currentLastName,
        password: currentPassword,
        accounts: []
      });
      return res.json({ success: true, user });
    }
  }
  res.json({ success: false });
});

function getNextAccountId(filePath) {
  if (!fs.existsSync(filePath)) return 1;
  const lines = fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter(line => line.trim());
  let max = 0;
  for (let i = 1; i < lines.length; i++) {
    const num = parseInt(lines[i].split(',')[0], 10);
    if (num > max) max = num;
  }
  return max + 1;
}

app.post('/api/accounts', (req, res) => {
  const filePath = path.join(__dirname, 'database', 'accounts.csv');
  const acct = req.body;
  acct.accountNumber = getNextAccountId(filePath);
  const header = 'accountNumber,customerId,accountType,accountBalance,overdraftLimit,pin,interestRate,monthlyDeposit,goal,dailyPayout\n';
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, header, 'utf-8');
  }
  const line = [
    acct.accountNumber,
    acct.customerId,
    acct.accountType,
    acct.accountBalance ?? '',
    acct.overdraftLimit ?? '',
    acct.pin ?? '',
    acct.interestRate ?? '',
    acct.monthlyDeposit ?? '',
    acct.goal ?? '',
    acct.dailyPayout ?? ''
  ].join(',') + '\n';
  fs.appendFileSync(filePath, line, 'utf-8');
  res.json({ success: true, account: acct });
});

app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});

  // Customer-ID
app.get('/api/accounts/:customerId', (req, res) => {
  const filePath = path.join(__dirname, 'database', 'accounts.csv');
  const customerId = parseInt(req.params.customerId, 10);

  if (!fs.existsSync(filePath)) {
    return res.json({ success: true, accounts: [] });
  }

  const lines = fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter(l => l.trim());

  const accounts = lines.slice(1)
    .map(line => {
      const [
        accountNumber, custId, accountType, accountBalance,
        overdraftLimit, pin, interestRate, monthlyDeposit,
        goal, dailyPayout
      ] = line.split(',');
      return {
        accountNumber: +accountNumber,
        customerId: +custId,
        accountType,
        accountBalance: +accountBalance,
        overdraftLimit: overdraftLimit ? +overdraftLimit : undefined,
        pin: pin || undefined,
        interestRate: interestRate ? +interestRate : undefined,
        monthlyDeposit: monthlyDeposit ? +monthlyDeposit : undefined,
        goal: goal ? +goal : undefined,
        dailyPayout: dailyPayout ? +dailyPayout : undefined
      };
    })
    .filter(acc => acc.customerId === customerId);

  res.json({ success: true, accounts });
});


app.post('/api/accounts/:accountNumber/transaction', (req, res) => {
  const filePath = path.join(__dirname, 'database', 'accounts.csv');
  const acctNum = parseInt(req.params.accountNumber, 10);
  const { amount, type } = req.body; 

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'Accounts CSV nicht gefunden' });
  }

  const lines = fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter(l => l.trim());
  const header = lines[0];
  const rows = lines.slice(1);

  let updatedAccount = null;
  const newRows = rows.map(line => {
    const cols = line.split(',');
    if (parseInt(cols[0], 10) === acctNum) {
      let balance = parseFloat(cols[3]) || 0;
      balance = type === 'deposit' ? balance + amount : balance - amount;
      cols[3] = balance.toFixed(2);
      updatedAccount = { ...cols }; 
    }
    return cols.join(',');
  });

  // rewrite CSV 
  fs.writeFileSync(filePath, [header, ...newRows].join('\n') + '\n', 'utf-8');

  if (updatedAccount) {
    res.json({ success: true, account: { accountNumber: acctNum, accountBalance: parseFloat(updatedAccount[3]) } });
  } else {
    res.status(404).json({ success: false, message: 'Konto nicht gefunden' });
  }
});

  // Edit Customer
app.put('/api/users/:id', (req, res) => {
  const filePath = path.join(__dirname, 'database', 'users.csv');
  const userId = req.params.id;
  const { firstName: newFirstName, lastName: newLastName } = req.body;

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'Users CSV nicht gefunden' });
  }

  const lines = fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter(line => line.trim());
  const header = lines[0];
  let updatedUser = null;

  const newLines = lines.slice(1).map(line => {
    const [idStr, oldFirst, oldLast, password] = line.split(',');
    if (idStr === userId) {
      updatedUser = new User({
        id: parseInt(idStr, 10),
        firstName: newFirstName,
        lastName: newLastName,
        password
      });
      return [idStr, newFirstName, newLastName, password].join(',');
    }
    return line;
  });

  if (!updatedUser) {
    return res.status(404).json({ success: false, message: 'User nicht gefunden' });
  }

  fs.writeFileSync(filePath, [header, ...newLines].join('\n') + '\n', 'utf-8');

  res.json({ success: true, user: updatedUser });
});

app.post('/api/accounts/:accountNumber/transfer', (req, res) => {
  const filePath = path.join(__dirname, 'database', 'accounts.csv');
  const fromNum = parseInt(req.params.accountNumber, 10);
  const { targetAccountNumber, amount } = req.body;

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'Accounts CSV nicht gefunden' });
  }

  // load CSV
  const lines = fs.readFileSync(filePath, 'utf-8')
    .split('\n').filter(l => l.trim());
  const header = lines[0];
  const rows = lines.slice(1).map(line => line.split(','));

  let srcRow, tgtRow;
  rows.forEach(cols => {
    const num = +cols[0];
    if (num === fromNum) srcRow = cols;
    if (num === +targetAccountNumber) tgtRow = cols;
  });

  if (!srcRow) {
    return res.status(404).json({ success: false, message: 'Quellkonto nicht gefunden' });
  }
  if (!tgtRow) {
    return res.status(404).json({ success: false, message: 'Zielkonto nicht gefunden' });
  }

  const balanceSrc = parseFloat(srcRow[3]) || 0;
  const overdraftLimit = parseFloat(srcRow[4]) || 0;
  if (balanceSrc - amount < -overdraftLimit) {
    return res.status(400).json({ success: false, message: 'Überziehungslimit erreicht' });
  }

  const newSrcBal = balanceSrc - amount;
  const balanceTgt = parseFloat(tgtRow[3]) || 0;
  const newTgtBal = balanceTgt + amount;

  srcRow[3] = newSrcBal.toFixed(2);
  tgtRow[3] = newTgtBal.toFixed(2);

  const newLines = [header, ...rows.map(r => r.join(','))].join('\n') + '\n';
  fs.writeFileSync(filePath, newLines, 'utf-8');

  res.json({
    success: true,
    sourceAccount: {
      accountNumber: fromNum,
      accountBalance: newSrcBal
    },
    targetAccount: {
      accountNumber: +targetAccountNumber,
      accountBalance: newTgtBal
    }
  });
});