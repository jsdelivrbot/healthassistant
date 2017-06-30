var express = require('express');
var app = express();

app.set('port', (process.env.PORT || 5000));

app.use(express.static(__dirname + '/public'));

// views is directory for all template files
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

app.get('/', function(request, response) {
    //response.render('pages/sample');
    response.status(200).json(JSON.stringify({'message':'Hello Test'});
    //console.log('Node app is running on port', app.get('port'));

    //response.writeHead("200, {'Content-Type': 'text/html'}");
    //response.send(JSON.stringify(resp));
});

app.listen(app.get('port'), function() {
    console.log('Node app is running on port', app.get('port'));
});