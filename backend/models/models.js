const mongoose = require('mongoose');
const { String, Number, Date, ObjectId } = require('mongoose').Schema.Types;

const connection = mongoose.createConnection("mongodb://localhost:27017/ledger");
// connection.dropCollection("accounts", (err) => {
// 	if (err) throw err;
// });
// connection.dropCollection("transactions", (err) => {
// 	if (err) throw err;
// });

// Create Account Model
const accountSchema = new mongoose.Schema({
  type: { type: String },
  category: String,
  name: String,
  initialBalance: Number,
  initTxnId: { type: ObjectId , ref: "accounts" },
  transactions: [{ type: ObjectId , ref: "transactions" }]
});
const Account = connection.model("accounts", accountSchema);

// Create Transaction Model
const transactionSchema = new mongoose.Schema({
  date: String,
  description: String,
  creditAccount: { type: ObjectId , ref: "accounts" },
  debitAccount: { type: ObjectId , ref: "accounts" },
  amount: Number,
  note: { type: String }
});

const Transaction = connection.model("transactions", transactionSchema);

// (async () => {
// 	const initAcc = new Account({
// 		type: "INIT",
// 		category: "INIT",
// 		name: "INIT",
// 		initialBalance: 0
// 	})
// 	const acc1 = new Account({
// 		type: "Asset",
// 		category: "Cash",
// 		name: "PNC Spending",
// 		initialBalance: 0
// 	})
// 	const acc2 = new Account({
// 		type: "Asset",
// 		category: "Savings",
// 		name: "Wealthfront",
// 		initialBalance: 0
// 	})
// 	const acc3 = new Account({
// 		type: "Equity",
// 		category: "Expense",
// 		name: "Groceries",
// 		initialBalance: 0
// 	})

// 	const initTxn1 = new Transaction({
// 		date: "19880-01-01",
// 		description: "INIT",
// 		creditAccount: initAcc.id,
// 		debitAccount: acc1.id,
// 		amount: 0
// 	})

// 	const initTxn2 = new Transaction({
// 		date: "19880-01-01",
// 		description: "INIT",
// 		creditAccount: initAcc.id,
// 		debitAccount: acc2.id,
// 		amount: 0
// 	})

// 	const initTxn3 = new Transaction({
// 		date: "19880-01-01",
// 		description: "INIT",
// 		debitAccount: initAcc.id,
// 		creditAccount: acc3.id,
// 		amount: 0
// 	})

// 	await initTxn1.save();
// 	await initTxn2.save();
// 	await initTxn3.save();

// 	acc1.initTxnId = initTxn1.id;
// 	acc2.initTxnId = initTxn2.id;
// 	acc3.initTxnId = initTxn3.id;

// 	await initAcc.save();
// 	await acc1.save();
// 	await acc2.save();
// 	await acc3.save();
// })()
module.exports = {
	Account,
	Transaction
}