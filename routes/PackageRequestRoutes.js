const express = require('express');
const router = express.Router();
const packageRequestController = require('../controllers/PackageRequestController');
const packageUpload = require('../middleware/PackageRequestUploadMiddleware');

// Submit package request
router.post(
    '/',
    packageUpload.single('packageImage'),
    packageRequestController.submitPackageRequest
);

module.exports = router;