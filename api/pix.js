const { MercadoPagoConfig, Payment } = require('mercadopago');
const admin = require('firebase-admin');

// Inicializa o Firebase usando as credenciais completas que salvamos na Vercel
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Corrige eventuais quebras de linha que a Vercel insere na chave privada
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    })
  });
}

const db = admin.firestore();

// 💡 SEGURANÇA EXTRA: Pega o token limpando espaços invisíveis que possam quebrar a SDK
const tokenLimpo = (process.env.MERCADO_PAGO_TOKEN || "").trim();

const client = new MercadoPagoConfig({
  accessToken: tokenLimpo
});
const paymentInstance = new Payment(client);

module.exports = async (req, res) => {
  // Configurações de CORS para conversar com o GitHub Pages
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', 'https://heidern87.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { jogoId, golsCasa, golsVisita, nome, whatsapp } = req.body;
    const idDoJogo = jogoId || req.body.jogoId;

    if (!idDoJogo || golsCasa === undefined || golsVisita === undefined || !nome || !whatsapp) {
      return res.status(400).json({ error: 'Dados insuficientes' });
    }

    // Validação extra antes de chamar o Mercado Pago
    if (!tokenLimpo) {
      throw new Error('O token do Mercado Pago nao foi carregado nas variaveis de ambiente da Vercel.');
    }

    const emailFicticio = `bolao-${Date.now()}@bolao.com`;

    const paymentData = {
      body: {
        transaction_amount: 5.00,
        description: `Palpite Bolão - ${nome}`,
        payment_method_id: 'pix',
        payer: {
          email: emailFicticio,
          first_name: nome.split(' ')[0],
          last_name: nome.split(' ').slice(1).join(' ') || 'Silva'
        }
      }
    };

    const payment = await paymentInstance.create(paymentData);

    // Na SDK v2, os dados do Pix costumam vir direto na raiz do payment ou dentro de payment.body
    const dadosResposta = payment.body || payment;

    if (!dadosResposta || !dadosResposta.point_of_interaction) {
      throw new Error('Resposta invalida da API do Mercado Pago ao gerar o Pix.');
    }

    const qrCodeBase64 = dadosResposta.point_of_interaction.transaction_data.qr_code_base64;
    const copyAndPaste = dadosResposta.point_of_interaction.transaction_data.qr_code;

    // Salva o palpite provisório no Firebase
    const novoPalpite = {
      jogoId: idDoJogo,
      golsCasa: parseInt(golsCasa),
      golsVisita: parseInt(golsVisita),
      nome,
      whatsapp,
      email: emailFicticio,
      status: 'provisorio',
      criadoEm: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('palpites').add(novoPalpite);

    return res.status(200).json({
      success: true,
      qrCodeBase64,
      copyAndPaste
    });

  } catch (error) {
    console.error('Erro ao gerar Pix:', error);
    return res.status(500).json({ error: error.message });
  }
};