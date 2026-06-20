const express = require('express');

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
    res.send('Server OK');
});

app.post('/chat', (req, res) => {

    console.log(req.body);

    res.json({
        reply: 'Xin chào từ Render'
    });

});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
});