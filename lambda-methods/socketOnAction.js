const mysql = require('mysql');
const AWS = require('aws-sdk');
let connection;

const mysqlQuery = (sql, connection) => {

    return new Promise((res, rej) => {
        connection.query(sql, function (err, result) {
            if (err) {
                console.log(err);
                rej(err);
            }
            else {
                res(result);
            }
        });
    });
};

const postToConnection = (params, event) => {

    const apigwManagementApi = new AWS.ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
    });

    return new Promise((resolve, reject) => {
        apigwManagementApi.postToConnection(params, function (err, data) {
            if (err) {
                console.log(err, err.stack);
                reject(err);
            }
            else {
                console.log(data);
                resolve(data);
            }
        });
    });
};


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

    let sql = '';
    let connectionId = event.requestContext.connectionId;
    let body = JSON.parse(event.body);

    sql = `
        select ConnectionID from WebsocketConnections
        where ConnectionID != '${connectionId}'
        and CallID = '${body.callid}';
    `;

    (async () => {

        let result = await mysqlQuery(sql, connection);
        await postToConnection({
            ConnectionId: result[0].ConnectionID,
            Data: event.body
        }, event);

        return callback(null, {});
    })();
};
