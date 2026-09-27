import { Kafka, Producer, Consumer, logLevel } from "kafkajs";

const kafka = new Kafka({
  clientId: "nexus-ledger",
  brokers: [process.env.KAFKA_BROKER || "localhost:9092"],
  logLevel: logLevel.WARN,
});

// Topics — one per event type

// here i learnt that each topic has a specific purpose and schema
export const TOPICS = {
  TRANSACTION_POSTED: "ledger.transaction.posted",
  TRANSACTION_VOIDED: "ledger.transaction.voided",
  PAYMENT_SUCCESS: "payments.payment.success",
  PAYMENT_FAILED: "payments.payment.failed",
  PAYMENT_REFUNDED: "payments.payment.refunded",
  CRYPTO_DEPOSIT: "crypto.deposit.detected",
  CRYPTO_WITHDRAWAL: "crypto.withdrawal.sent",
  RECONCILIATION_ALERT: "reconciliation.alert.created",
  FX_CONVERSION: "fx.conversion.completed",
} as const;

let producer: Producer | null = null;

export async function getProducer(): Promise<Producer> {
  if (!producer) {
    producer = kafka.producer({
      allowAutoTopicCreation: true,
      // create topic on first publish if it doesn't exist
      transactionTimeout: 30000,
    });
    await producer.connect();
    console.log("Kafka producer connected");
  }
  return producer;
}

export async function publishEvent(
  topic: string,
  payload: Record<string, unknown>,
  key?: string,
  // key controls which partition message goes to
): Promise<void> {
  const prod = await getProducer();

  await prod.send({
    topic,
    messages: [
      {
        key: key || null,
        value: JSON.stringify({
          ...payload,
          eventId: crypto.randomUUID(),

          timestamp: new Date().toISOString(),
          source: "nexus-ledger",
        }),
        headers: {
          "content-type": "application/json",
          "schema-version": "1.0",
        },
      },
    ],
  });
}

export async function createConsumer(
  groupId: string,

  topics: string[],
  handler: (topic: string, payload: Record<string, unknown>) => Promise<void>,
): Promise<Consumer> {
  const consumer = kafka.consumer({ groupId });
  await consumer.connect();

  await consumer.subscribe({
    topics,
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return;

      try {
        const payload = JSON.parse(message.value.toString());
        await handler(topic, payload);
      } catch (error) {
        console.error(`Failed to process Kafka message on ${topic}:`, error);
      }
    },
  });

  console.log(`Kafka consumer ${groupId} listening on: ${topics.join(", ")}`);
  return consumer;
}
