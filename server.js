const express = require('express');

const app = express();

app.use(express.json());

const VERIFY_TOKEN = "Vietnam84@";

app.get('/', (req, res) => {
    res.send('Server OK');
});

app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('Webhook verified');
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

app.post('/webhook', (req, res) => {
    console.log(JSON.stringify(req.body, null, 2));
    res.sendStatus(200);
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