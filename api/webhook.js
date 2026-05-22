const { MercadoPagoConfig, Payment } = require('mercadopago');
const admin = require('firebase-admin');

// Inicializa o Firebase usando as credenciais completas que salvamos na Vercel
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    })
  });
}

const db = admin.firestore();

// Configura o cliente do Mercado Pago na v2
const tokenLimpo = (process.env.MERCADO_PAGO_TOKEN || "").trim();
const client = new MercadoPagoConfig({
  accessToken: tokenLimpo
});
const paymentInstance = new Payment(client);

module.exports = async (req, res) => {
  // Garante que só aceita requisições POST do Mercado Pago
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  try {
    const { type, data } = req.body;

    // Verifica se a notificação é de um pagamento recebido
    if (type === 'payment' || req.query['data.id']) {
      const paymentId = data?.id || req.query['data.id'];

      // Chamada atualizada para buscar os detalhes do pagamento na v2
      const paymentInfo = await paymentInstance.get({ id: paymentId });

      // Na v2 os dados vêm direto no objeto ou dentro de .body
      const dadosPagamento = paymentInfo.body || paymentInfo;
      const status = dadosPagamento.status;
      const emailUsuario = dadosPagamento.payer?.email;

      // Se o Pix foi pago com sucesso, atualiza o status no Firebase Firestore
      if (status === 'approved' && emailUsuario) {
        const palpitesRef = db.collection('palpites');
        const snapshot = await palpitesRef.where('email', '==', emailUsuario).where('status', '==', 'provisorio').get();

        if (!snapshot.empty) {
          const batch = db.batch();
          snapshot.docs.forEach(doc => {
            batch.update(doc.ref, { status: 'confirmado', paymentId: paymentId });
          });
          await batch.commit();
          console.log(`Sucesso: Palpites associados ao email ${emailUsuario} foram confirmados!`);
        }
      }
    }

    // Responde 200 OK para o Mercado Pago saber que recebemos o aviso
    res.status(200).send('OK');
  } catch (error) {
    console.error('Erro no processamento do webhook:', error);
    res.status(500).json({ error: error.message });
  }
};