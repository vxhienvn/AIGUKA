const express = require('express');
const OpenAI = require('openai');

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY
});

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

async function getAIReply(customerMessage) {
    const response = await openai.responses.create({
        model: "gpt-4.1-mini",
        input: `
Bạn là nhân viên tư vấn của Tổng Kho Thiết Bị Bếp & Nhà Tắm Miền Bắc.

Nhiệm vụ:
- Trả lời ngắn gọn, tự nhiên, lịch sự.
- Ưu tiên hỏi nhu cầu và xin số điện thoại/Zalo.
- Không bịa giá chi tiết nếu khách chưa nói rõ mẫu.
- Nếu khách hỏi quạt: tư vấn quạt trần, quạt mạ vàng, quạt đèn trang trí.
- Nếu khách hỏi thiết bị vệ sinh: tư vấn combo phòng tắm, bồn cầu thông minh, sen tắm, lavabo.
- Kết thúc bằng câu hỏi để khách phản hồi tiếp.

Khách hỏi: ${customerMessage}
        `
    });

    return response.output_text || "Dạ anh/chị cho em xin số điện thoại/Zalo để tư vấn mẫu phù hợp ạ.";
}

async function sendMessage(senderId, text) {
    await fetch(
        `https://graph.facebook.com/v23.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipient: { id: senderId },
                message: { text }
            })
        }
    );
}

app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'page') {
        for (const entry of body.entry) {
            for (const event of entry.messaging) {
                if (!event.message || !event.message.text) continue;

                const senderId = event.sender.id;
                const customerMessage = event.message.text;

                console.log("Customer:", customerMessage);

                try {
                    const aiReply = await getAIReply(customerMessage);
                    console.log("AI:", aiReply);
                    await sendMessage(senderId, aiReply);
                } catch (error) {
                    console.error("Error:", error);
                    await sendMessage(
                        senderId,
                        "Dạ hiện hệ thống tư vấn tự động đang bận một chút. Anh/chị để lại số điện thoại/Zalo, bên em gọi tư vấn trực tiếp ạ."
                    );
                }
            }
        }

        res.status(200).send('EVENT_RECEIVED');
        return;
    }

    res.sendStatus(404);
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
});