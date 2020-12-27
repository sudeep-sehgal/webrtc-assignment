const mysql = require('mysql');
let connection;

exports.handler = (event, context, callback) => {

    if (!connection) {

        let { stageVariables } = event;
        connection = mysql.createPool({
            connectionLimit: 10,
            host: stageVariables.host,
            user: stageVariables.username,
            password: stageVariables.password,
            database: stageVariables.database,
            port: '3306',
            multipleStatements: true
        });

        console.log('connection created');
    }

    context.callbackWaitsForEmptyEventLoop = false;
    let connectionId = event.requestContext.connectionId;

    var sql = `
        delete from WebsocketConnections 
        where ConnectionID = '${connectionId}';
    `;

    connection.query(sql, function (err, result) {
        if (err) {
            console.log(JSON.stringify(err));
            return callback(err);
        }

        console.log("1 record removed");
        return callback(null, {});
    });

};
