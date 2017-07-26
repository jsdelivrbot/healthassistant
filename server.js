var express = require("express");
var bodyParser = require("body-parser");
var mongodb = require("mongodb");
var CircularJSON = require("circular-json");
var AlexaAppServer = require('alexa-app-server');
var Alexa = require('alexa-sdk');
var APP_ID = "";

var MONGO_CONNECTION_URL = 'mongodb://adityakotamraju:Health123@ds151752.mlab.com:51752/health_assistant';
var COLLECTION = {
    "USERS": "Users",
};

var app = express();
app.use(bodyParser.json());
app.set('port', (process.env.PORT || 5007));

var instance = AlexaAppServer.start({
    server_root: __dirname, // Path to root 
    public_html: "/views", // Static content 
    app_dir: "/", // Location of alexa-app modules 
    app_root: "/alexa", // Service root 
    port: 8080 // Port to use 
});

app.set('views', __dirname + '/views');
app.engine('html', require('ejs').renderFile);

var db;
var alexa = require("./alexa/alexa_response");
var evaluator = require("./alexa/data_evaluation");

// Connect to the database before starting the application server.
mongodb.MongoClient.connect(MONGO_CONNECTION_URL, function(err, database) {
    if (err) {
        console.log(err);
        process.exit(1);
    }

    db = database;
    console.log("Database connected to Health Assistant");
});

// Generic error handler used by all endpoints.
function handleError(res, reason, message, code) {
    console.log("ERROR: " + reason);
    res.status(code || 200).json({
        "error": message
    });
}

/*  "/app/login"
 *    POST: Authenticates the user with the app
 */

app.get("/", function(req, res) {
    res.render("pages/sample.ejs");
});

/*  "/app/login"
 *    POST: Authenticates the user with the app
 */

app.post("/app/login", function(req, res) {
    db.collection(COLLECTION.USERS).find({
        $and: [{
                email: req.body.username
            },
            {
                password: req.body.password
            }
        ]
    }).toArray(function(err, docs) {
        if (err) {
            handleError(res, err.message, "Invalid username and password");
        } else {
            if (docs.length > 0) {
                delete docs[0].password;
                res.status(200).json(docs);
            } else {
                handleError(res, "Username password match not found", "Invalid username and password");
            }
        }
    });
});

/*  "/app/scheduleTask"
 *    POST: Schedules tasks for each user
 */

app.post("/app/scheduleTask", function(req, res) {

    var newTask = req.body;
    var moment = require("moment");
    var taskDate = moment(newTask.dateTime, "x").format("DD MMM YYYY hh:mm a");
    console.log('Task Received: ', newTask);
    db.collection(COLLECTION.USERS).findOneAndUpdate({
        "_id": newTask._id
    }, {
        $addToSet: {
            "tasks": {
                "tasktype": newTask.taskType,
                "taskDesc": newTask.taskDesc,
                "date": taskDate
            }
        }
    }).then((resp) => {
        console.log('Task Successfully inserted');
        res.status(200).json({
            "success": "Task scheduled successfully"
        });
    }, (er) => {
        handleError(res, er.message, "Schduling task failed, please try again after sometime");
    });
});

app.post("/app/LogHealthData", function(req, res) {
    var newTask = req.body;
    var moment = require("moment");
    var type = newTask.type;
    var taskDate = moment(newTask.dateTime, "x").format("YYYY-MM-DD");
    console.log('Task Received: ', newTask);
    db.collection(COLLECTION.USERS).findOneAndUpdate({
        "_id": newTask._id
    }, {
        $addToSet: {
            "healthdata": {
                "value": newTask.value,
                "type": type,
                "date": taskDate
            }
        }
    }).then((resp) => {
        console.log('Data Successfully inserted');
        res.status(200).json({
            "success": "Data scheduled successfully"
        });
        var tips = evaluator.evaluate(newTask._id, newTask.value, type, db);
        if (tips !== null) {
            app.updateTips(newTask._id, tips);
        }
    }, (er) => {
        handleError(res, er.message, "Data insert failed, please try again after sometime");
    });
});

app.updateTips = function(userid, tip) {
    console.log('updateTips');
    db.collection(COLLECTION.USERS).findOneAndUpdate({
        "_id": userid
    }, {
        $addToSet: {
            "tips": {
                "value": tip
            }
        }
    }).then((resp) => {
        console.log('tip Successfully inserted');
    }, (er) => {
        console.log("tip insert failed, please try again after sometime");
    });
};

app.post("/alexa", function(req, res) {
    //console.log('Received request from alexa..!' + CircularJSON.stringify(req));
    var alexa_id = req.body.context.System.user.userId;
    var userObj = null;
    db.collection(COLLECTION.USERS).find({
        "alexa_id": alexa_id
    }, { "_id": 1, "name": 1 }).toArray(function(err, docs) {
        if (err) {
            handleError(res, err.message, "Error in finding user details");
        } else {
            $elemMatch: {
                docs
            }
            userObj = docs[0];
            console.log(userObj);
            /////CODE ALEXA VOICE

            if (req.body.request.type === "LaunchRequest") {
                var resp = alexa.sayHello(userObj.name);
                res.status(200).json(resp);
            } else if (req.body.request.type === "IntentRequest") {
                var intentName = req.body.request.intent.name;
                switch (intentName) {
                    case "SayHello":
                        var resp = alexa.sayHello(userObj.name);
                        res.status(200).json(resp);
                        break;
                    case "AMAZON.CancelIntent":
                        var resp = alexa.sayGoodBye();
                        res.status(200).json(resp);
                        break;
                    case "GetTasks":
                        var date = "19 Jul 2017 01:35 pm";
                        var id = userObj._id;
                        db.collection(COLLECTION.USERS).find({
                            $and: [{
                                    "_id": id
                                },
                                {
                                    "tasks": {
                                        $elemMatch: {
                                            "date": date
                                        }
                                    }
                                }
                            ]
                        }).toArray(function(err, docs) {
                            if (err) {
                                handleError(res, err.message, "Error in finding tasks for the user");
                            } else {
                                $elemMatch: {
                                    docs
                                }
                                var resp = alexa.sayTasks(docs);
                                res.status(200).json(resp);
                                /*if (docs.length > 0) {
                                    var resp = alexa.sayTasks(docs);
                                    res.status(200).json(resp);
                                } else {
                                    handleError(res, "No tasks scheduled yet");
                                }*/
                            }
                        });

                        break;

                    case "ReadHealthData":
                        var date = req.body.request.intent.slots.day.value; //2017-07-24
                        var id = userObj._id;
                        var slotName = req.body.request.intent.slots.measurementType.value; //steps
                        console.log("Slot:" + slotName + " Date:" + date);
                        db.collection(COLLECTION.USERS).find({
                            "_id": id,
                            "healthdata": {
                                $elemMatch: {
                                    "date": date,
                                    "type": slotName
                                }
                            }
                        }, { "healthdata.$": 1 }).toArray(function(err, docs) {
                            if (err) {
                                handleError(res, err.message, "You don't have data for " + slotName);
                            } else {
                                $elemMatch: {
                                    docs
                                }
                                var resp = alexa.readData(docs, slotName);
                                res.status(200).json(resp);
                            }
                        });
                        break;

                    case "GetTips":
                        var id = userObj._id;
                        db.collection(COLLECTION.USERS).find({
                            "_id": id
                        }, { "tips.$": 1 }).toArray(function(err, docs) {
                            if (err) {
                                handleError(res, err.message, "You don't have any tips");
                            } else {
                                $elemMatch: {
                                    docs
                                }
                                var resp = alexa.getSSMLResponse(docs, false, false);
                                res.status(200).json(resp);
                            }
                        });
                        break;

                    case "LogHealthData":
                        var date = req.body.request.intent.slots.day.value;
                        var id = "1002";
                        var slotName = req.body.request.intent.slots.measurementType.value;
                        db.collection(COLLECTION.USERS).findOneAndUpdate({
                            "_id": id
                        }, {
                            $addToSet: {
                                "healthdata": {
                                    "type": slotName,
                                    "value": newTask.taskType,
                                    "date": date
                                }
                            }
                        }).then((resp) => {
                            console.log('Task Successfully inserted');
                            res.status(200).json({
                                "success": "Task scheduled successfully"
                            });
                        }, (er) => {
                            handleError(res, er.message, "Schduling task failed, please try again after sometime");
                        });
                        break;
                }
            }




            ///////END


        }
    });

});

app.listen(app.get('port'), function() {
    console.log('Node app is running on port', app.get('port'));
});

exports.handler = function(event, context, callback) {
    var alexa = Alexa.handler(event, context);
    alexa.APP_ID = APP_ID;
    // To enable string internationalization (i18n) features, set a resources object.
    alexa.resources = languageStrings;
    alexa.registerHandlers(handlers);
    alexa.execute();
};

var handlers = {
    //Use LaunchRequest, instead of NewSession if you want to use the one-shot model
    // Alexa, ask [my-skill-invocation-name] to (do something)...
    'LaunchRequest': function() {
        db.collection(COLLECTION.USERS).find({
            "alexa_id": alexa_id
        }, { "_id": 1, "name": 1 }).toArray(function(err, docs) {
            if (err) {
                handleError(res, err.message, "Error in finding user details");
            } else {
                $elemMatch: {
                    docs
                }
                userObj = docs[0];
                var resp = alexa.sayHello(userObj.name);
                this.attributes['speechOutput'] = resp; //this.t("WELCOME_MESSAGE", this.t("SKILL_NAME"));
                // If the user either does not reply to the welcome message or says something that is not
                // understood, they will be prompted again with this text.
                this.attributes['repromptSpeech'] = this.t("HELP_REPROMPT");
                this.emit(':ask', this.attributes['speechOutput'], this.attributes['repromptSpeech'])
            }
        });
    },
    'AMAZON.HelpIntent': function() {
        this.attributes['speechOutput'] = this.t("HELP_MESSAGE");
        this.attributes['repromptSpeech'] = this.t("HELP_REPROMPT");
        this.emit(':ask', this.attributes['speechOutput'], this.attributes['repromptSpeech'])
    },
    'AMAZON.RepeatIntent': function() {
        this.emit(':ask', this.attributes['speechOutput'], this.attributes['repromptSpeech'])
    },
    'AMAZON.StopIntent': function() {
        this.emit('SessionEndedRequest');
    },
    'AMAZON.CancelIntent': function() {
        this.emit('SessionEndedRequest');
    },
    'SessionEndedRequest': function() {
        this.emit(':tell', this.t("STOP_MESSAGE"));
    },
    'Unhandled': function() {
        this.attributes['speechOutput'] = this.t("HELP_MESSAGE");
        this.attributes['repromptSpeech'] = this.t("HELP_REPROMPT");
        this.emit(':ask', this.attributes['speechOutput'], this.attributes['repromptSpeech'])
    }
};

var languageStrings = {
    "en": {
        "translation": {
            "SKILL_NAME": "Minecraft Helper",
            "WELCOME_MESSAGE": "Welcome to %s. You can ask a question like, what\'s the recipe for a chest? ... Now, what can I help you with.",
            "WELCOME_REPROMPT": "Is there anything else I can help with?",
            "HELP_MESSAGE": "You can ask questions such as, my steps today or what\'s my tips, what can I help you with?",
            "HELP_REPROMPT": "You can say things like, what\'s my tips, or you can say cancel...Now, what can I help you with?",
            "STOP_MESSAGE": "Goodbye!"
        }
    }
};