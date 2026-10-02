import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import { ENV } from '#src/infrastructure/config/constants.js';
import { EXTENSION_ORIGIN_SCHEMES } from '#src/http/constants.js';

export default fp(async function corsPlugin(fastify: FastifyInstance) {
  const allowedOrigins = process.env[ENV.CORS_ORIGIN]
    ?.split(',')
    .map((origin) => origin.trim()) ?? ['http://localhost:3000'];
  await fastify.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      // Allow browser extension requests: the Trakwyn Clipper in Chrome, and
      // in Safari (JEF-386)
      if (EXTENSION_ORIGIN_SCHEMES.some((scheme) => origin.startsWith(scheme))) {
        return cb(null, true);
      }
      // Allow explicit origins from CORS_ORIGIN env var (comma-separated)
      if (allowedOrigins.includes(origin)) return cb(null, true);
      // Allow Vercel preview deployments (*.vercel.app)
      if (origin.endsWith('.vercel.app')) return cb(null, true);
      // Refused, not failed. Handing an Error to this callback makes
      // @fastify/cors throw, which surfaces as a 500 — so a routine
      // cross-origin request from an origin we simply do not list looked
      // like the API falling over, and burned a server error in the logs
      // and metrics every time. Answering `false` omits the
      // Access-Control-Allow-Origin header instead, which is what actually
      // enforces CORS: the browser blocks the response. The request is
      // still refused; it is now refused correctly.
      cb(null, false);
    },
    credentials: true,
    // @fastify/cors defaults to GET,HEAD,POST (the CORS-spec "simple"
    // methods) when this is omitted — fine while every route was GraphQL
    // POST, but the local-storage upload PUT route below needs it listed
    // explicitly or its preflight response omits PUT and the browser drops
    // the real request before it's ever sent.
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'],
  });
});
