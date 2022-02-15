from gql import gql, Client
from gql.transport.aiohttp import AIOHTTPTransport

# Select your transport with a defined url endpoint
transport = AIOHTTPTransport(url="http://localhost:4000/graphql")

# Create a GraphQL client using the defined transport
client = Client(transport=transport, fetch_schema_from_transport=True)

# Provide a GraphQL query
get_transactions = gql(
    """
	query GetTransactions {
	  transactions {
	    id
	    date
	    description
	    creditAccount {
	      name
	      id
	    }
	    debitAccount {
	      name
	      id
	    }
	    amount
	  }
	}
"""
)

# Execute the query on the transport
result = client.execute(get_transactions)

import pandas as pd

def parse_transaction(transaction):

	_id = transaction.id
	date = transaction.date
	description = transaction.description
	creditAccount = {
		'name': transaction.creditAccount.name,
		'id': transaction.creditAccount.id
	}
	debitAccount = {
		'name': transaction.debitAccount.name,
		'id': transaction.debitAccount.id
	}
	amount = transaction.amount

	


