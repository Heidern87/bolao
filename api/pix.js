const { MercadoPagoConfig, Payment } = require('mercadopago');
const admin = require('firebase-admin');

// Inicializa o Firebase se ainda não foi inicializado
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID
  });
}

const db = admin.firestore();

// 💡 NOVO PADRÃO DA VERSÃO 2: Configura o cliente do Mercado Pago corretamente
const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_TOKEN
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
    const { juegoId, golsCasa, golsVisita, nome, whatsapp } = req.body;

    // Ajuste caso a variável venha como jogoId ou juegoId do front-end
    const idDoJogo = juegoId || req.body.jogoId;

    if (!idDoJogo || golsCasa === undefined || golsVisita === undefined || !nome || !whatsapp) {
      return res.status(400).json({ error: 'Dados insuficientes' });
    }

    const emailFicticio = `bolao-${Date.now()}@bolao.com`;

    // 💡 NOVO PADRÃO DA VERSÃO 2: Montagem do objeto de pagamento
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

    // Chamada usando a nova instância da SDK v2
    const payment = await paymentInstance.create(paymentData);

    if (!payment || !payment.point_of_interaction) {
      throw new Error('Resposta inválida do Mercado Pago');
    }

    const qrCodeBase64 = payment.point_of_interaction.transaction_data.qr_code_base64;
    const copyAndPaste = payment.point_of_interaction.transaction_data.qr_code;

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