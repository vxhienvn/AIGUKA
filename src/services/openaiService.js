const OpenAI = require("openai");
const config = require("../config");
const { buildSalesPrompt } = require("../prompts/salesPrompt");
const { buildBrainContextForMessage } = require("../ai/brainContextService");
const { answerProductQuery } = require("../ai/productObjectService");

const openai = new OpenAI({
    apiKey: config.OPENAI_API_KEY
});

async function getAIReply(historyText) {
    let brainContext = "";
    let productAnswerBlock = "";
    try {
        const productBrain = await answerProductQuery(historyText, { limit: 8 });
        if (productBrain?.answer) {
            productAnswerBlock = [
                "PRODUCT BRAIN - CÂU TRẢ LỜI SẢN PHẨM ƯU TIÊN:",
                productBrain.answer,
                "Khi trả lời khách, ưu tiên dùng đúng model/giá/kích thước này, không nói chung chung là chưa có dữ liệu."
            ].join("\n");
        }
    } catch (error) {
        console.warn("[PRODUCT_BRAIN_DIRECT_SKIP]", error?.message || error);
    }
    try {
        brainContext = await buildBrainContextForMessage(historyText, { limit: 12, maxChars: 22000 });
    } catch (error) {
        console.warn("[AI_BRAIN_CONTEXT_SKIP]", error?.message || error);
    }
    const finalBrainContext = [productAnswerBlock, brainContext].filter(Boolean).join("\n\n");
    const response = await openai.responses.create({
        model: "gpt-4.1-mini",
        input: buildSalesPrompt(historyText, finalBrainContext)
    });

    return response.output_text || "Dạ anh cho em xin thêm nhu cầu cụ thể để bên em tư vấn mẫu phù hợp ạ.";
}

module.exports = {
    openai,
    getAIReply
};
