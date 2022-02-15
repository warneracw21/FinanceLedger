const express = require('express');
var cors = require('cors');

const { graphqlHTTP } = require('express-graphql');
const schema = require('./schema/schema');

const { URLSearchParams } = require('url');
global.URLSearchParams = URLSearchParams;

const app = express();
app.use(cors());

app.use('/graphql', graphqlHTTP({
	schema,
	graphiql: true
}));

app.listen(4000, () => {
	console.log('listening on port 4000')
});