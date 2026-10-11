const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true
    },
    iqama: {
        type: String,
        required: [true, 'Iqama number is required'],
        trim: true,
        index: true
    },
    nationality: {
        type: String,
        required: [true, 'Nationality is required'],
        trim: true
    },
    profession: {
        type: String,
        required: [true, 'Profession is required'],
        trim: true
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        trim: true
    },
    status: {
        type: String,
        enum: ['Active', 'On Leave', 'Inactive'],
        default: 'Active'
    },
    notes: {
        type: String,
        trim: true,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt timestamp before saving
employeeSchema.pre('save', function() {
    this.updatedAt = Date.now();
});

module.exports = mongoose.model('Employee', employeeSchema);
