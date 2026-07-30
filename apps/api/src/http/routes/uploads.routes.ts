import type { FastifyInstance } from 'fastify';
import { createReadStream } from 'fs';
import { stat, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';

export async function registerUploadRoutes(fastify: FastifyInstance): Promise<void> {
  const uploadDir = join(process.cwd(), 'uploads');

  // Serve uploaded files
  fastify.get('/uploads/:key', async (request, reply) => {
    const { key } = request.params as { key: string };
    const filePath = join(uploadDir, key);

    try {
      await stat(filePath);
      return reply.type('application/octet-stream').send(createReadStream(filePath));
    } catch {
      return reply.code(404).send({ error: 'File not found' });
    }
  });

  // Handle upload requests (used by LocalStorageProvider)
  fastify.post('/uploads/_upload/:key', async (request, reply) => {
    const { key } = request.params as { key: string };
    const filePath = join(uploadDir, key);

    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request.raw) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }

      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, Buffer.concat(chunks));

      return reply.code(200).send({ success: true, key });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Upload failed' });
    }
  });
}
