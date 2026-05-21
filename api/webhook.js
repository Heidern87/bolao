const mp = require('mercadopago');
const admin = require('firebase-admin');

// Inicializa o Firebase se ainda não foi inicializado
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID
  });
}

const db = admin.firestore();

// Configura o Mercado Pago com o Token das Variáveis Ambientais
mp.configure({
  access_token: process.env.MERCADO_PAGO_TOKEN
});

module.exports = async (req, res) => {
  // Garante que só aceita requisições POST (que é o formato que o Mercado Pago envia)
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  try {
    const { type, data } = req.body;

    // Verifica se a notificação é de um pagamento recebido
    if (type === 'payment' || req.query['data.id']) {
      const paymentId = data?.id || req.query['data.id'];
      
      // Busca os detalhes do pagamento no Mercado Pago
      const paymentInfo = await mp.payment.get(paymentId);
      const status = paymentInfo.body.status;
      const emailUsuario = paymentInfo.body.payer.email; // Usado para identificar quem pagou

      // Se o Pix foi pago com sucesso, atualiza o Firebase
      if (status === 'approved') {
        const palpitesRef = db.collection('palpites');
        const snapshot = await palpitesRef.where('email', '==', emailUsuario).where('status', '==', 'provisorio').get();

        if (!snapshot.empty) {
          const batch = db.batch();
          snapshot.docs.forEach(doc => {
            batch.update(doc.ref, { status: 'confirmado', paymentId: paymentId });
          });
          await batch.commit();
        }
      }
    }

    // Responde 200 OK para o Mercado Pago não ficar reenviando a mesma notificação
    res.status(200).send('OK');
  } catch (error) {
    console.error('Erro no webhook:', error);
    res.status(500).json({ error: error.message });
  }
};
