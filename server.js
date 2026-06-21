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
        console.log('Webhook verification failed');
        res.sendStatus(403);
    }
});

async function getAIReply(customerMessage) {
    const response = await openai.responses.create({
        model: "gpt-4.1-mini",
        input: `
Bạn là nhân viên tư vấn bán hàng của Tổng Kho Thiết Bị Bếp & Nhà Tắm Miền Bắc.

VAI TRÒ:
- Trả lời như nhân viên bán hàng thật.
- Không nói mình là AI nếu khách không hỏi.
- Trả lời ngắn gọn, tự nhiên, không lan man.

THÔNG TIN DOANH NGHIỆP:
- Tổng kho phân phối toàn miền Bắc.
- Kinh doanh nhiều thương hiệu khác nhau.
- Có thương hiệu riêng GUKA.
- GUKA có quạt trần, quạt đèn, thiết bị nội thất và nhiều dòng sản phẩm khác.
- Showroom: 254 Phố Keo, Gia Lâm, Hà Nội.
- Hotline/Zalo: 0973693677.

SẢN PHẨM:
- Quạt trần, quạt đèn, quạt mạ vàng.
- Bồn cầu thông minh, sen tắm, lavabo, thiết bị vệ sinh.
- Combo phòng tắm, thiết bị bếp, gạch đá ốp lát, nội thất.

PHÂN KHÚC:
- Cơ bản, trung cấp, cao cấp.
- Quạt cùng mẫu thường có bản cơ bản và bản cao cấp động cơ Nhật/Ý nhập khẩu.
- Combo có loại phối sẵn và loại tự chọn theo nhu cầu.

MỤC TIÊU ƯU TIÊN:
1. Xin số điện thoại hoặc Zalo.
2. Với khách hỏi thiết bị vệ sinh, phòng tắm, gạch đá, nội thất: mời khách đến showroom.
3. Sau đó mới tư vấn sâu.

KỊCH BẢN:

KHÁCH HỎI QUẠT:
- Ưu tiên xin số điện thoại/Zalo.
- Hỏi diện tích phòng, ngân sách, phong cách.
- Không cần ép khách ra showroom.

KHÁCH HỎI THIẾT BỊ VỆ SINH / PHÒNG TẮM / GẠCH ĐÁ / NỘI THẤT:
- Ưu tiên xin số điện thoại/Zalo.
- Mời khách qua showroom 254 Phố Keo, Gia Lâm để xem thực tế.
- Nhấn mạnh xem thực tế dễ chọn hơn ảnh.

KHÁCH HỎI GIÁ:
- Không tự bịa giá.
- Nói giá phụ thuộc mẫu, kích thước, phiên bản và số lượng.
- Xin số Zalo/điện thoại để gửi đúng mẫu và báo giá.

KHÁCH CHÊ XA:
- Không tranh cãi.
- Nói bên em có hỗ trợ chi phí khách đến xem showroom theo chương trình.
- Có hỗ trợ vận chuyển khi mua hàng theo chính sách.
- Hỏi khách ở khu vực nào.

KHÁCH CHÊ ĐẮT:
- Nói bên em có nhiều phân khúc: cơ bản, trung cấp, cao cấp.
- Cùng kiểu dáng thường có nhiều phiên bản.
- Hỏi ngân sách và xin Zalo để gửi mẫu phù hợp.

KHÁCH HỎI COMBO:
- Nói có combo phối sẵn và combo tự chọn theo nhu cầu.
- Xin số Zalo/điện thoại để gửi combo phù hợp.

KHÁCH ĐỂ LẠI SỐ:
- Cảm ơn khách.
- Xác nhận sẽ có nhân viên liên hệ.
- Hỏi thêm sản phẩm khách quan tâm.

QUY TẮC:
- Tối đa 4 câu.
- Tối đa 80 từ.
- Luôn cố gắng lấy số điện thoại hoặc Zalo.
- Luôn kết thúc bằng câu hỏi.
- Không tư vấn quá sâu khi chưa có thông tin liên hệ.

Khách vừa nhắn:
"${customerMessage}"
        `
    });

    return response.output_text || "Dạ anh/chị cho em xin số điện thoại/Zalo để bên em tư vấn mẫu phù hợp ạ.";
}

async function sendMessage(senderId, text) {
    const url = `https://graph.facebook.com/v23.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            recipient: { id: senderId },
            message: { text }
        })
    });

    const result = await response.text();

    console.log("Facebook send status:", response.status);
    console.log("Facebook send result:", result);

    if (!response.ok) {
        throw new Error(`Facebook send failed: ${response.status} - ${result}`);
    }
}

app.post('/webhook', async (req, res) => {
    console.log("========== WEBHOOK HIT ==========");
    console.log(JSON.stringify(req.body, null, 2));

    const body = req.body;

    if (body.object !== 'page') {
        res.sendStatus(404);
        return;
    }

    for (const entry of body.entry || []) {
        for (const event of entry.messaging || []) {
            if (!event.message || !event.message.text) {
                continue;
            }

            if (event.message.is_echo) {
                console.log("Ignore echo message");
                continue;
            }

            const senderId = event.sender.id;
            const customerMessage = event.message.text;

            console.log("Customer ID:", senderId);
            console.log("Customer Message:", customerMessage);

            try {
                console.log("Calling OpenAI...");

                const aiReply = await getAIReply(customerMessage);

                console.log("AI Reply:", aiReply);

                await sendMessage(senderId, aiReply);
            } catch (error) {
                console.error("Error:", error);

                try {
                    await sendMessage(
                        senderId,
                        "Dạ hiện hệ thống tư vấn tự động đang bận một chút. Anh/chị để lại số điện thoại/Zalo, bên em gọi tư vấn trực tiếp ạ."
                    );
                } catch (sendError) {
                    console.error("Fallback send error:", sendError);
                }
            }
        }
    }

    res.status(200).send('EVENT_RECEIVED');
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
});