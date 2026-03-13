// Dependencies
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const app = express();
require('dotenv').config();

// DB Connection
mongoose.connect(process.env.MONGO_URI, {
}).then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));


// Middleware
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static('public/uploads'));

app.use(session({
  secret: 'hgfbjrjhejrhfiwfhouuu4uy4y84uu49hjhdhhdu',
  resave: false,
  saveUninitialized: true,
  }));

app.use (flash());

app.use((req, res, next)=> {
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.user = req.session.user || null;
  next();
});

//routes
app.use('/', require('./routes/index'));

app.get('/', (req, res) => {
    res.render('index');
});

//server
const PORT = process.env.PORT || 9000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));