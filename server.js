const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

var apiRoutes         = require('./routes/api.js');

const app = express();

//Database mongoose  connection
mongoose.connect(process.env.DB);
mongoose.Promise = global.Promise;
let db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'))

//Bodyparser setup
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));



app.route('/')
  .get(function (req, res) {
    res.sendFile(process.cwd() + '/views/index.html');
  });

  apiRoutes(app);

  app.use(function(req, res, next) {
    res.status(404)
      .type('text')
      .send('Not Found');
  });

  app.listen(process.env.PORT || 3000, function () {
    console.log("Listening on port " + process.env.PORT);
  });