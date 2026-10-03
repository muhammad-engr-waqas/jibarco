require('dotenv').config();
const app = require('./api/index');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log('========================================================');
    console.log(`  JIBARCO Server is running at http://localhost:${PORT}`);
    console.log(`  Portal Login: http://localhost:${PORT}/login.html`);
    console.log('========================================================');
});
