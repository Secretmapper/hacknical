import Koa from 'koa';
import path from 'path';
import koaLogger from 'koa-logger';
import convert from 'koa-convert';
import bodyParser from 'koa-bodyparser';
import Csrf from 'koa-csrf';
import cors from 'kcors';
import locales from 'koa-locales';
import session from 'koa-session';
import config from 'config';
import nunjucks from 'nunjucks';
import views from 'koa-views';
import userAgent from 'koa-useragent';

import assetsPath from '../middlewares/assets_helper';
import { redisMiddleware } from '../middlewares/cache_helper';
import catchError from '../middlewares/error_helper';
import checkLocale from '../middlewares/locale_helper';
import mqMiddleware from '../middlewares/mq_middleware';
import router from '../routes';
import logger from '../utils/logger';

const appKey = config.get('appKey');
const port = config.get('port');
const appName = config.get('appName');
const redis = config.get('redis');

const app = new Koa();
app.proxy = true;
app.keys = [appKey];

const options = {
  defaultLocale: 'zh-CN',
  dirs: [path.join(__dirname, '../config/locales')],
  localeAlias: {
    en: 'en-US',
    fr: 'fr-FR',
    zh: 'zh-CN'
  }
};
locales(app, options);

app.use(convert(cors()));

// bodyparser
app.use(bodyParser());

// koa logger
app.use(convert(koaLogger()));
// session
const CONFIG = {
  key: `${appName.toUpperCase()}:session`, /** cookie key */
  maxAge: 24 * 60 * 60 * 1000 * 7, /** 7 days */
  overwrite: true, /** (boolean) can overwrite or not (default true) */
  httpOnly: true, /** (boolean) httpOnly or not (default true) */
  signed: true, /** (boolean) signed or not (default true) */
};
app.use(convert(session(CONFIG, app)));

// cache
app.use(redisMiddleware({
  url: redis
}));
// mq
app.use(mqMiddleware());
// locale
app.use(checkLocale());
// catch error
app.use(catchError());
// csrf
app.use(new Csrf());
// helper func
app.use(async (ctx, next) => {
  ctx.state = Object.assign({}, ctx.state, {
    assetsPath,
    csrf: ctx.csrf,
    isMobile: false,
    env: process.env.NODE_ENV,
    footer: {
      about: ctx.__('dashboard.about'),
      feedback: ctx.__('dashboard.feedback'),
      code: ctx.__('dashboard.code'),
    },
  });
  await next();
});

// user-agent
app.use(convert(userAgent()));

// 配置nunjucks模板文件所在的路径，否则模板继承时无法使用相对路径
nunjucks.configure(path.join(__dirname, '../templates'), { autoescape: true });
// frontend static file
app.use(convert(require('koa-static')(path.join(__dirname, '../../public'))));
// views with nunjucks
app.use(views(path.join(__dirname, '../templates'), {
  map: {
    html: 'nunjucks'
  }
}));
// router
app.use(router.routes(), router.allowedMethods());
// error
app.on('error', (err) => {
  logger.error(err);
});

app.listen(process.env.PORT || port);

export default app;
