import { ApolloServer } from "apollo-server-micro";
import schema from "../../../graphql/schema";
import { createContext } from '../../../graphql/context';
import depthLimit from 'graphql-depth-limit';
import { RequestHandler } from 'micro'
import { NextApiHandler } from "next";
import Cors from 'cors';
import initMiddleware from "@/utils/init-middleware";

const cors = initMiddleware(
  Cors({
    credentials: true,
    origin: ['http://127.0.0.1:3000', 'http://localhost:3000', 'https://studio.apollographql.com'],
  })
);

const apolloServer = new ApolloServer({
  schema,
  context: createContext,
  validationRules: [depthLimit(4)],
  formatError(err) {
    return err;
  }
});

export const config = {
  api: {
    bodyParser: false
  }
};

const handler: RequestHandler = async (req, res) => {
  await cors(req, res);
  await apolloServer.createHandler({ path: '/api/graphql' })(req, res);
}

const createHandler = async () => {
  await apolloServer.start();
  return handler;
}

let promiseHandler: Promise<RequestHandler>;
const getHandler = async () => {
  if (promiseHandler) return promiseHandler;
  return promiseHandler = createHandler();
}

const requestHandler: NextApiHandler = async (req, res) => (await getHandler())(req, res);

export default requestHandler;