const OpenAI = require("openai");
const config = require("../config");
const { buildSalesPrompt } = require("../prompts/salesPrompt");
const { buildBrainContextForMessage } = require("../ai/brainContextService");

const openai = new OpenAI({
    apiKey: config.OPENAI_API_KEY
});

async function getAIReply(historyText) {
    let brainContext = "";
    try {
        brainContext = await buildBrainContextForMessage(historyText, { limit: 12, maxChars: 22000 });
    } catch (error) {
        console.warn("[AI_BRAIN_CONTEXT_SKIP]", error?.message || error);
    }
    const response = await openai.responses.create({
        model: "gpt-4.1-mini",
        input: buildSalesPrompt(historyText, brainContext)
    });

    return response.output_text || "Dạ anh cho em xin thêm nhu cầu cụ thể để bên em tư vấn mẫu phù hợp ạ.";
}

module.exports = {
    openai,
    getAIReply
};
