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
    // CAPTURA AMPLIADA: Pega o ID enviado no corpo ou na URL da requisição
    const paymentId = req.body.data?.id || req.body.id || req.query['data.id'] || req.query.id;

    if (paymentId) {
      console.log(`Recebida notificação para o ID de pagamento: ${paymentId}`);

      // Busca os detalhes do pagamento na v2
      const paymentInfo = await paymentInstance.get({ id: paymentId });
      const dadosPagamento = paymentInfo.body || paymentInfo;

      const status = dadosPagamento.status;
      const emailUsuario = dadosPagamento.payer?.email;

      console.log(`Status do pagamento ${paymentId}: ${status} | Email: ${emailUsuario}`);

      // Aceita tanto 'approved' quanto 'authorized' para garantir a liberação
      if ((status === 'approved' || status === 'authorized') && emailUsuario) {
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

    // Retorna SEMPRE 200 para o Mercado Pago zerar os erros e parar de travar a fila
    res.status(200).send('OK');
  } catch (error) {
    console.error('Erro no processamento do webhook:', error);
    // Mesmo se der erro interno de busca, retornamos 200 para o Mercado Pago marcar como entregue
    res.status(200).send('OK com erro interno tratado');
  }
};