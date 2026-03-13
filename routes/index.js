const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { check, validationResult } = require('express-validator');
const Student = require('../models/Student');
const path = require('path');
const nodemailer = require('nodemailer');
const crypto = require('crypto');


//Nodemailer Setup

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});



// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => 
    cb(null, 'public/uploads/'),
  filename: (req, file, cb) => 
    cb(null, Date.now() + '-' + file.originalname),
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5mb
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only images are allowed (jpeg, png, gif, jpg)'));
  }
});

const generateRegNumber = async () => {
  const lastStudent = await Student.findOne().sort({ createdAt: -1});
  const lastNumber = lastStudent ? parseInt(lastStudent.regNumber.replace('TECHSPHERE', '')) : 0;
  return `TECHSPHERE${(lastNumber + 1).toString().padStart(3, '0')}`;
};

// Middleware to check authentication
const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    return next();
  }
  req.flash('error', 'Please login to access this page');
  res.redirect('/login');
};

// Home Route
router.get('/', (req, res) => {
  try {
    // Check if user is authenticated via session
    const isAuthenticated = req.session.user ? true : false;
    let userData = null;

    // If authenticated, fetch additional user data if needed
    if (isAuthenticated) {
      userData = {
        id: req.session.user.id,
        name: req.session.user.name,
        username: req.session.user.username,
        profileImage: req.session.user.profileImage
      };
    }

    // Render index page with appropriate data
    res.render('index', {
      title: 'TechSphere Academy',
      user: userData,  // Pass null if not authenticated
      isAuthenticated: isAuthenticated, // Explicit auth status
      currentRoute: 'home' // For active nav styling
    });

  } catch (err) {
    console.error('Home route error:', err);
    // Render index page even if there's an error, but without user data
    res.render('index', {
      title: 'TechSphere Academy',
      user: null,
      isAuthenticated: false,
      currentRoute: 'home'
    });
  }
});

// Login page
router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('login', { title: 'Login Page' });
});

router.post('/login', [
  check('username').trim().notEmpty().withMessage("Username is Required"),
  check('password').trim().notEmpty().withMessage("Password is Required"),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.flash('error', errors.array()[0].msg);
    return res.redirect('/login');
  }

  try {
    const { username, password } = req.body;
    const student = await Student.findOne({ username });

    if (!student) {
      req.flash('error', 'Invalid Credentials');
      return res.redirect('/login');
    }

    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch) {  // Fixed: Added ! to properly check password match
      req.flash('error', 'Invalid Credentials');
      return res.redirect('/login');
    }

    req.session.user = {
      id: student._id,
      name: student.name,
      username: student.username,
      profileImage: student.profileImage
    };
    req.flash('success', 'Login Successful');
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Server error');
    return res.redirect('/login');
  }
});

// Registration
router.get('/register', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('register', { title: 'Register' });
});

router.post('/register', (req, res) => {
  upload.single('profileImage')(req, res, async (err) => {
    const { name, email, phone, password, username, course, address, confirmPassword, termsCheck } = req.body;
    const errors = [];
    
    // Validation
    if (!name) errors.push('Fullname is Required');
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) errors.push('Valid Email is Required'); // Fixed: Removed space after @
    if (!phone) errors.push('Phone number is Required');
    if (!course) errors.push('Course is Required');
    if (!address) errors.push('Address is Required');
    if (!username || username.length < 4) errors.push('Username must be at least 4 Characters');
    if (!password || password.length < 6) errors.push('Password must be at least 6 Characters');
    if (password !== confirmPassword) errors.push('Password does not match'); // Fixed: Removed ! before password
    if (!termsCheck) errors.push('You must accept the terms and conditions');
    if (err) errors.push(err.message);

    if (errors.length > 0) {
      req.flash('error', errors[0]); // Fixed: Removed quotes around errors[0]
      return res.redirect('/register');
    }

    try {
      // Check if user exists
      const existingUser = await Student.findOne({ $or: [{ username }, { email }] });
      if (existingUser) {
        req.flash('error', 'Username or email already Exists');
        return res.redirect('/register');
      }

      // Hash Password
      const hashedPassword = await bcrypt.hash(password, 10);
      const regNumber = await generateRegNumber();

      // Create new student
      const newStudent = new Student({
        name,
        email,
        phone,
        course,
        address,
        username,
        password: hashedPassword,
        profileImage: req.file ? '/uploads/' + req.file.filename : null, // Fixed: Added missing slash
        regNumber,
        resetPasswordToken: null,
        resetPasswordExpires: null
      });

      await newStudent.save();


      //Send Welcome Email

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Welcome to Telsphere Academy',
        html: `
        <h1>Welcome ${name}!</h1>
        <p>Your Registration was Successful.</p>
        <p><strong>Registration Number:</strong> ${regNumber}</p>
        <p><strong>Course:</strong> ${course}</p>
        <p>You can now login to your Dashboard using your username: ${username}</p>
        <p>Thank you for choosing TechSphere Academy</p>
        `
      };

      await transporter.sendMail(mailOptions);



      // Auto login
      req.session.user = {
        id: newStudent._id,
        name: newStudent.name,
        username: newStudent.username,
        profileImage: newStudent.profileImage
      };
      
      req.flash('success', 'Registration Successful');
      res.redirect('/dashboard');
    } catch (error) {
      console.error(error);
      req.flash('error', 'Registration failed. Please try again.');
      return res.redirect('/register'); // Fixed: Changed from /registration to /register
    }
  });
});

// Dashboard route
router.get('/dashboard', isAuthenticated, async (req, res) => {
  try {
    const student = await Student.findById(req.session.user.id);
    if (!student) {
      req.session.destroy();
      return res.redirect('/login');
    }
    res.render('dashboard', {
      title: 'Dashboard',
      student,
      currentRoute: 'dashbboard'
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error loading dashboard');
    res.redirect('/login');
  }
});


// GET route - Show edit profile form

router.get('/profile/edit', isAuthenticated, async (req, res) => {
  try{
    const  student = await Student.findById(req.session.user.id);
    res.render('edit-profile', {
      title: 'Edit Profile',
      student,
      success: req.flash('success'),
      error: req.flash('error')
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error loading profile');
    res.redirect('/dashboard');
  }
});

// POST route - Handle profile updates

router.post('/profile/update', isAuthenticated, upload.single('profileImage'),
async (req, res) => {
  try {
    const { name, email, phone, address } = req.body;

    //Basic validation
    if (!name || !email) {
      req.flash('error', 'Name and email are required');
      return res.redirect('/profile/edit');
    }

    const updateData = {
      name,
      email,
      phone,
      address
    };

    //Handle file upload if exists
    if (req.file) {
      updateData.profileImage = '/uploads/' + req.file.filename;
    }

    const updateStudent = await Student.findByIdAndUpdate(
      req.session.user.id,
      updateData,
      { new: true }
    );

    // Update session data
    req.session.user = {
      ...req.session.user,
      name: updateStudent.name,
      profileImage: updateStudent.profileImage
    };

    req.flash('success', 'Profile updated successfully!');
    res.redirect('/profile/edit');
  } catch(error) {
    console.error(error);
    req.flash('error', 'Error updating profile');
    res.redirect('/profile/edit')
  }
});

// Logout Route
router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Session Destruction error:', err);
    }
    res.redirect('/');
  });
});



 //Change Password

    // GET route to show the change password page

    router.get('/change-password', isAuthenticated, (req, res) => {
      res.render('change-password', {
        title: 'Change Password',
        success: req.flash('success'),
        error: req.flash('error')
      });
    });
    

    //POST route to handle password change
    router.post('/change-password', isAuthenticated, [
      //Validation
      check('currentPassword').notEmpty().withMessage('Current password is required'),
      check('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
      check('confirmPassword').custom((value, { req }) => {
        if (value !== req.body.newPassword) {
          throw new Error('Password do not match');
        }
        return true
      })
    ], async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        req.flash('error', errors.array()[0].msg);
        return res.redirect('/change-password');
      }
      try {
        const { currentPassword, newPassword } = req.body;
        const student = await Student.findById(req.session.user.id);

        //Verify Current Password
        const isMatch = await bcrypt.compare(currentPassword, student.password);
        if (!isMatch) {
          req.flash('error', 'Current password is incorrect');
          return res.redirect('/change password');
        }

        // Hash New Password
        const hashedPassword = await bcrypt.hash(newPassword,  10);

        // Update Password
        await Student.findByIdAndUpdate(
          req.session.user.id,
          { password: hashedPassword }
        );

        req.flash('success', 'Password changed successfully!');
        res.redirect('/change-password');  //login
      } catch (error) {
        console.error(error);
        req.flash('error', 'An error occurred while changing password');
        res.redirect('/change-password');
      }
    });

router.get('/forgot-password', (req, res) => {
  res.render('forgot-password', { title: 'TechSphere: Forgot Password' });
});


router.post('/forgot-password', async (req, res) =>{
  try{
    const { email } = req.body;
    const student = await Student.findOne({ email });

    if (!student) {
      req.flash('error', 'No account with the email exists.');
      return res.redirect('/forgot-password');
    }

    const token = crypto.randomBytes(20).toString('hex');
    student.resetPasswordToken = token;
    student.resetPasswordExpires = Date.now() + 36000000; //1 hour
    await student.save();

    //Edit Profile

    //Send Mail

    const resetUrl = `http://${req.headers.host}/reset-password/${token}`;
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: student.email,
        subject: 'Password Reset Request',
        html: `
        <h1>You requested a password reset for your TechSphere Academy Account</h1>
        <p>Click this link to reset your password</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>This link will expire in 1 hour.</p>
        `
  };

   await transporter.sendMail(mailOptions);
   req.flash('success', 'Password reset mail sent. Check your inbox');
      res.redirect('/login');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Error Processing your request');
      return res.redirect('/forgot-password');
    }

});


router.get('/reset-password', (req, res) => {
  res.render('reset-password', { title: 'TechSphere: Reset Password' });
});

// Static Pages
router.get('/about', (req, res) => {
  res.render('about', { title: 'TechSphere: About' });
});

router.get('/courses', (req, res) => {
  res.render('courses', { title: 'TechSphere: Courses' });
});

router.get('/contact', (req, res) => {
  res.render('contact', { title: 'TechSphere: Contact' });
});

router.get('/admissions', (req, res) => {
  res.render('admissions', { title: 'TechSphere: Admissions' });
});

module.exports = router;