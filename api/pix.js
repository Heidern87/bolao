const mp = require('mercadopago');
const admin = require('firebase-admin');

// Inicializa o Firebase se ainda não foi inicializado
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID
  });
}

const db = admin.firestore();

// Configura o Mercado Pago com o Token
mp.configure({
  access_token: process.env.MERCADO_PAGO_TOKEN
});

module.exports = async (req, res) => {
  // Configurações de CORS para conversar perfeitamente com o GitHub Pages
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

    if (!jogoId || golsCasa === undefined || golsVisita === undefined || !nome || !whatsapp) {
      return res.status(400).json({ error: 'Dados insuficientes' });
    }

    // Criar um ID único de e-mail fictício para associar ao Mercado Pago e identificar o pagador no Webhook
    const emailFicticio = `bolao-${Date.now()}@bolao.com`;

    // Configura a requisição de pagamento para o Mercado Pago
    const paymentData = {
      transaction_amount: 5.00,
      description: `Palpite Bolão - ${nome}`,
      payment_method_id: 'pix',
      payer: {
        email: emailFicticio,
        first_name: nome.split(' ')[0],
        last_name: nome.split(' ').slice(1).join(' ') || 'Silva'
      }
    };

    const payment = await mp.payment.create(paymentData);
    
    if (!payment.body || !payment.body.point_of_interaction) {
      throw new Error('Resposta inválida do Mercado Pago');
    }

    const qrCodeBase64 = payment.body.point_of_interaction.transaction_data.qr_code_base64;
    const copyAndPaste = payment.body.point_of_interaction.transaction_data.qr_code;

    // Salva o palpite como "provisorio" no banco do Firebase Firestore
    const novoPalpite = {
      jogoId,
      golsCasa: parseInt(golsCasa),
      golsVisita: parseInt(golsVisita),
      nome,
      whatsapp,
      email: emailFicticio,
      status: 'provisorio',
      criadoEm: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('palpites').add(novoPalpite);

    // Retorna o sucesso e os códigos Pix para o index.html exibir na tela
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
