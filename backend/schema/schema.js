const graphql = require('graphql');
const moment = require('moment');
const {getEthPriceNow,getEthPriceHistorical}= require('get-eth-price');

const { Account, Transaction } = require('../models/models')

const {
	GraphQLSchema,
	GraphQLObjectType, 
	GraphQLInputObjectType,
	GraphQLString,
	GraphQLInt,
	GraphQLID,
	GraphQLList,
	GraphQLFloat } = graphql;

const AccountType = new GraphQLObjectType({
	name: 'Account',
	fields: () => ({
		id: { type: GraphQLID },
		type: { type: GraphQLString },
		category: { type: GraphQLString },
		name: { type: GraphQLString },
		initialBalance: { type: GraphQLFloat },
		initTxnId: { type: GraphQLID },
		balance: {
			type: GraphQLFloat,
			async resolve(parent, args) {

				var txns = await Transaction.find({
					$or: [
						{ creditAccount: parent.id },
						{ debitAccount: parent.id }
					]
				})

				// Only look at historical transactions for balance
				txns = txns.filter(txn => new Date(txn.date).getTime() < new Date().getTime())
				// txns = txns.filter(txn => txn.description !== "INIT")

				var mult = (parent.type === "Equity") ? -1 : 1;

				const balance = txns.reduce((bal, txn) => {
					if (!txn.amount) { return bal }; 
					if (parent.id == txn.creditAccount) {
						return bal - (txn.amount * mult);
					} 
					return bal + (txn.amount * mult);
				}, 0)

				if (parent.name === "ETH") {
					return new Promise((resolve, reject) => {
						getEthPriceNow()
							.then(data => {
								const prices = Object.values(data)[0]
								resolve(balance * prices.ETH.USD)
							})
							.catch(err => reject(err))
						})
				}

				return balance
			}
		},
		transactions: {
			type: GraphQLList(TransactionType),
			resolve(parent, args) {
				return Transaction.find({
					$or: [
						{ creditAccount: parent.id },
						{ debitAccount: parent.id }
					]
				})
			}
		}
	}) 
});

const TransactionType = new GraphQLObjectType({
	name: 'Transaction',
	fields: () => ({
		id: { type: GraphQLID },
		date: { type: GraphQLString },
		description: { type: GraphQLString },
		creditAccount: { 
			type: AccountType,
			resolve(parent, args) {
				return Account.findById(parent.creditAccount)
			}
		},
		debitAccount: { 
			type: AccountType,
			resolve(parent, args) {
				return Account.findById(parent.debitAccount)
			}
		},
		amount: { type: GraphQLFloat },
		note: { type: GraphQLString }
	}) 
});

const IncomeTableEntry = new GraphQLObjectType({
	name: 'IncomeTableEntry',
	fields: () => ({
		incomeType: { type: GraphQLString },
		account: { type: AccountType },
		totalAmount: { type: GraphQLFloat },
	}) 
});

const IncomeTableType = new GraphQLObjectType({
	name: 'IncomeTableType',
	fields: () => ({
		revenueAccounts: { type: new GraphQLList(IncomeTableEntry) },
		expenseAccounts: { type: new GraphQLList(IncomeTableEntry) },
		gainsAccounts: { type: new GraphQLList(IncomeTableEntry) },
		netIncome: { type: GraphQLFloat },
	}) 
});

const RootQuery = new GraphQLObjectType({
	name: 'RootQueryType',
	fields: {
		ethPrice: {
			type: new GraphQLObjectType({
				name: 'ethPrice',
				fields: () => ({
					price: { type: GraphQLFloat }
				})
			}),
			resolve(parent, args) {
				return new Promise((resolve, reject) => {
					getEthPriceNow()
						.then(data => {
							const prices = Object.values(data)[0]
							resolve({
								price: prices.ETH.USD
							})
						})
						.catch(err => reject(err))
					})
			}
		},
		account: {
			type: AccountType,
			args: {id: {type: GraphQLID }},
			resolve(parent, args) {
				return Account.findById(args.id);
			}
		},
		accounts: {
			type: new GraphQLList(AccountType),
			resolve(parent, args) {
				return Account.find();
			}
		},
		transactions: {
			type: new GraphQLList(TransactionType),
			resolve(parent, args) {
				return Transaction.find()
			}
		},
		incomeTable: {
			type: IncomeTableType,
			args: {
				startDate: { type: GraphQLString },
				endDate: { type: GraphQLString }
			},
			async resolve(parent, args) {
				const equityAccounts = await Account.find({ type: "Equity" });

				// Find Revenue and Expense Accounts Balance
				const revenueAccounts = [];
				const expenseAccounts = [];
				const gainsAccounts = [];

				let account;
				let mult, balance;
				for (var i=0; i<equityAccounts.length; i++) {
					account = equityAccounts[i];

					// Get Transactions for Account
					var txns = await Transaction.find({
						$or: [
							{ creditAccount: account.id },
							{ debitAccount: account.id }
						]
					})

					// Only look at historical transactions for balance
					txns = txns.filter(txn => {
						const txnDate = new Date(txn.date).getTime();
						const startDate = new Date(args.startDate).getTime();
						const endDate = new Date(args.endDate).getTime();
						return ((txnDate >= startDate) && (txnDate <= endDate))
					})

					const balance = txns.reduce((balance, txn) => {
						if (!txn.amount) { return balance }; 
						if (account.id == txn.creditAccount) {
							return (balance - txn.amount);
						} return (balance + txn.amount);
					}, 0)

					if (account.category === "Revenue") {
						revenueAccounts.push({
							incomeType: "Revenue",
							account: account,
							totalAmount: balance * -1
						})
					
					} else if (account.category === "Expense") {
						expenseAccounts.push({
							incomeType: "Expense",
							account: account,
							totalAmount: balance 
						})
					
					} else if (account.category === "Gain or Loss") {
						if (account.name === "Write Up (ETH)") {
							const ethPrice = await new Promise((resolve, reject) => {
								getEthPriceNow()
									.then(data => {
										const prices = Object.values(data)[0]
										resolve(prices.ETH.USD)
									})
									.catch(err => reject(err))
								})
							gainsAccounts.push({
								incomeType: "Gain or Loss",
								account: account,
								totalAmount: balance * ethPrice * -1
							})
						} else {
							gainsAccounts.push({
								incomeType: "Gain or Loss",
								account: account,
								totalAmount: balance * -1
							})
						}
					}
				}

				const totalRevenues = revenueAccounts.reduce((total, acc) => acc.totalAmount + total, 0);
				const totalExpenses = expenseAccounts.reduce((total, acc) => acc.totalAmount + total, 0);
				const totalGainsOrLoss = gainsAccounts.reduce((total, acc) => acc.totalAmount + total, 0);
				const netIncome = totalRevenues + totalGainsOrLoss - totalExpenses;

				return ({
					revenueAccounts,
					expenseAccounts,
					gainsAccounts,
					netIncome
				});
			}

		},
		accountBalance: {
			type: new GraphQLObjectType({
				name: 'accountBalance',
				fields: () => ({
					id: { type: GraphQLID },
					balance: { type: GraphQLFloat },
					account: { 
						type: AccountType,
						resolve(parent, args) {
							return Account.findById(parent.id)
						}
					},
					transactions: { type: new GraphQLList(TransactionType) },
				}),
			}),
			args: {
				id: { type: GraphQLID },
				endDate: { type: GraphQLString },
			},
			async resolve(parent, args) {


				// Get Transactions for Account
				var txns = await Transaction.find({
					$or: [
						{ creditAccount: args.id },
						{ debitAccount: args.id }
					]
				});
				txns.sort((txn1, txn2) => (new Date(txn1.date).getTime() - new Date(txn2.date).getTime()))

				if (args.endDate) {
					txns = txns.filter(txn => new Date(txn.date).getTime() < new Date(args.endDate).getTime())
				}

				const balance = txns.reduce((bal, txn) => {
					if (!txn.amount) { return bal }; 
					if (args.id == txn.creditAccount) {
						return bal - (txn.amount);
					} 
					return bal + (txn.amount);
				}, 0)

				return {
					id: args.id,
					balance: balance,
					transactions: txns
				}
			}
		},
		accountOutflows: {
			type: new GraphQLObjectType({
				name: 'accountOutflows',
				fields: () => ({
					id: { type: GraphQLID },
					balance: { type: GraphQLFloat },
					numTxns: { type: GraphQLInt },
					transactions: { type: new GraphQLList(TransactionType) },
				}),
			}),
			args: {
				id: { type: GraphQLID },
				startDate: { type: GraphQLString },
				endDate: { type: GraphQLString },
			},
			async resolve(parent, args) {

				console.log(args)


				// Get Transactions for Account
				var txns = await Transaction.find({ creditAccount: args.id })
				txns = txns.filter(txn => txn.description !== "INIT")
				txns.sort((txn1, txn2) => (new Date(txn1.date).getTime() - new Date(txn2.date).getTime()))
				console.log(txns.length)

				if (args.startDate) {
					txns = txns.filter(txn => new Date(txn.date).getTime() >= new Date(args.startDate).getTime())

				}

				if (args.endDate) {
					txns = txns.filter(txn => new Date(txn.date).getTime() < new Date(args.endDate).getTime())
				}


				const balance = txns.reduce((bal, txn) => {
					if (!txn.amount) { return bal }; 
					if (args.id == txn.creditAccount) {
						return bal - (txn.amount);
					} else return bal;
				}, 0)

				return {
					id: args.id,
					balance: balance,
					transactions: txns,
					numTxns: txns.length
				}
			}
		},
		accountInflows: {
			type: new GraphQLObjectType({
				name: 'accountInflows',
				fields: () => ({
					id: { type: GraphQLID },
					balance: { type: GraphQLFloat },
					numTxns: { type: GraphQLInt },
					transactions: { type: new GraphQLList(TransactionType) },
				}),
			}),
			args: {
				id: { type: GraphQLID },
				startDate: { type: GraphQLString },
				endDate: { type: GraphQLString },
			},
			async resolve(parent, args) {


				// Get Transactions for Account
				var txns = await Transaction.find({ debitAccount: args.id })
				txns = txns.filter(txn => txn.description !== "INIT")
				txns.sort((txn1, txn2) => (new Date(txn1.date).getTime() - new Date(txn2.date).getTime()))

				if (args.startDate) {
					txns = txns.filter(txn => new Date(txn.date).getTime() >= new Date(args.startDate).getTime())
				}

				if (args.endDate) {
					txns = txns.filter(txn => new Date(txn.date).getTime() < new Date(args.endDate).getTime())
				}


				const balance = txns.reduce((bal, txn) => {
					if (!txn.amount) { return bal }; 
					if (args.id == txn.debitAccount) {
						return bal - (txn.amount);
					} else return bal;
				}, 0)

				return {
					id: args.id,
					balance: balance,
					transactions: txns,
					numTxns: txns.length
				}
			}
		},
	}
});

const Mutation = new GraphQLObjectType({
	name: 'Mutation',
	fields: {
		addAccount: {
			type: AccountType,
			args: {
				type: { type: GraphQLString },
				category: { type: GraphQLString },
				name: { type: GraphQLString },
				initialBalance: { type: GraphQLFloat }
			},
			async resolve(parent, args) {
				const account =  new Account({
					type: args.type,
					category: args.category,
					name: args.name,
					initialBalance: args.initialBalance
				})

				// Find ID of INIT Account
				const initAccount = await Account.find({ name: "INIT" }).exec();
				const initAccountId = initAccount[0].id;

				// Add Initializing Transaction
				const txn = new Transaction({
					date: "1980-01-01",
					description: "INIT",
					creditAccount: (args.type === "Asset") ? initAccountId : account.id,
					debitAccount: (args.type === "Asset") ? account.id : initAccountId,
					amount: args.initialBalance
				})
				await txn.save();
				account.initTxnId = txn._id;
				return account.save()
			}
		},
		editAccount: {
			type: AccountType,
			args: {
				id: { type: GraphQLID },
				type: { type: GraphQLString },
				category: { type: GraphQLString },
				name: { type: GraphQLString },
				initialBalance: { type: GraphQLFloat }
			},
			async resolve(parent, args) {
				console.log(args.id)

				// Find ID of INIT Account
				const initAccount = await Account.find({ name: "INIT" }).exec();
				const initAccountId = initAccount[0].id;

				const account = await Account.findById(args.id).exec();

				// Add Initializing Transaction
				const txn = await Transaction.findByIdAndUpdate(account.initTxnId, {
					date: "1980-01-01",
					description: "INIT",
					creditAccount: (args.type === "Asset") ? initAccountId : args.id,
					debitAccount: (args.type === "Asset") ? args.id : initAccountId,
					amount: args.initialBalance
				}).exec()

				return Account.findByIdAndUpdate(args.id, {
					type: args.type,
					category: args.category,
					name: args.name,
					initialBalance: args.initialBalance
				})
			}
		},
		deleteAccount: {
			type: AccountType,
			args: {
				id: { type: GraphQLID }
			},
			resolve(parent, args) {
				return Account.findByIdAndDelete(args.id)
			}
		},
		addTransaction: {
			type: TransactionType,
			args: {
				date: { type: GraphQLString },
				description: { type: GraphQLString },
				creditAccountId: { type: GraphQLID },
				debitAccountId: { type: GraphQLID },
				amount: { type: GraphQLFloat },
				note: { type: GraphQLString },
			},
			async resolve(parent, args) {
				const creditAccount = await Account.findById(args.creditAccountId);
				const debitAccount = await Account.findById(args.debitAccountId);

				const txn = new Transaction({
					date: moment(args.date).format('YYYY-MM-DD'),
					description: args.description,
					creditAccount,
					debitAccount,
					amount: args.amount,
					note: args.note
				})
				return txn.save()
			}
		},
		editTransaction: {
			type: TransactionType,
			args: {
				id: { type: GraphQLID },
				date: { type: GraphQLString },
				description: { type: GraphQLString },
				creditAccountId: { type: GraphQLID },
				debitAccountId: { type: GraphQLID },
				amount: { type: GraphQLFloat },
				note: { type: GraphQLString },
			},
			async resolve(parent, args) {
				const creditAccount = await Account.findById(args.creditAccountId);
				const debitAccount = await Account.findById(args.debitAccountId);

				return Transaction.findByIdAndUpdate(args.id, {
					date: moment(args.date).format('YYYY-MM-DD'),
					description: args.description,
					creditAccount,
					debitAccount,
					amount: args.amount,
					note: args.note,
				})
			}
		},
		deleteTransactions: {
			type: TransactionType,
			args: {
				ids: { type: GraphQLList(GraphQLID) },
			},
			async resolve(parent, args) {
				for (const id of args.ids) {
					await Transaction.findByIdAndDelete(id)
				}
			}
		}
	}
})

module.exports = new GraphQLSchema({
	query: RootQuery,
	mutation: Mutation
});