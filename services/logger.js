import winston from 'winston';

// Logger structuré centralisé (Winston).
// Niveaux : error < warn < info < http < debug
// - En dev : console coloré + détaillé
// - En prod : console JSON (facile à ingérer par Render/DataDog/Sentry)
const logLevels = {
  levels: { error: 0, warn: 1, info: 2, http: 3, debug: 4 },
  colors: { error: 'red', warn: 'yellow', info: 'green', http: 'magenta', debug: 'blue' }
};

winston.addColors(logLevels.colors);

const format = winston.format;

const isProd = process.env.NODE_ENV === 'production';

export const logger = winston.createLogger({
  levels: logLevels.levels,
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat(),
    // En prod : JSON. En dev : lisible + coloré.
    isProd
      ? format.json()
      : format.combine(format.colorize(), format.printf(({ timestamp, level, message, stack, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
          return `${timestamp} ${level}: ${message}${metaStr}${stack ? '\n' + stack : ''}`;
        }))
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// Méthodes d'aide pour un accès simple et cohérent (remplace console.log/error)
export const log = {
  error: (msg, meta) => logger.error(msg, meta),
  warn: (msg, meta) => logger.warn(msg, meta),
  info: (msg, meta) => logger.info(msg, meta),
  http: (msg, meta) => logger.http(msg, meta),
  debug: (msg, meta) => logger.debug(msg, meta)
};

export default logger;