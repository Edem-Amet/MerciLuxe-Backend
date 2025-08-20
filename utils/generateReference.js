function generateReferenceNumber() {
    const prefix = 'UH';
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substr(2, 4).toUpperCase();
    return `${prefix}${timestamp}${random}`;
}

module.exports = { generateReferenceNumber };