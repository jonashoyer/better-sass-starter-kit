import { Queue, Worker, QueueOptions, Processor, WorkerOptions, JobsOptions, QueueScheduler, QueueSchedulerOptions, ConnectionOptions, QueueEvents, QueueEventsOptions } from 'bullmq';
import { createRedisClient } from './redisClient';

export interface QueueManagerEntity<T = any, R = any, N extends string = any> {
  queueOptions?: QueueOptions;
  repeatableJobs?: {
    name: string;
    data: T;
    opts?: JobsOptions;
  }[];
  useQueueScheduler?: boolean | QueueSchedulerOptions;
  useQueueEvent?: boolean | QueueEventsOptions;
  
  processor?: false | string | Processor<T, R, N>;
  workerOptions?: WorkerOptions;
}

export interface QueueManagerTypeOptions<Q extends Record<string, QueueManagerEntity>> {
  queues: Q;
  processors?: {
    [K in keyof Q]?: Q[K] extends QueueManagerEntity<infer T, infer R, infer N> ? false | string | Processor<T, R, N> : never;
  }
  connection?: ConnectionOptions;

  useWorkers?: boolean;
  useQueueSchedulers?: boolean;
  useQueueEvent?: boolean;
  useRepeatableJobs?: boolean;
};
export type QueueManagerReturn<Q extends Record<string, QueueManagerEntity>> = {
  queues: {
    [K in keyof Q]: Q[K] extends QueueManagerEntity<infer T, infer R, infer N> ? Queue<T, R, N> : never;
  },
  workers: {
    [K in keyof Q]?: Q[K] extends QueueManagerEntity<infer T, infer R, infer N> ? Worker<T, R, N> : never;
  },
  queueSchedulers: {
    [K in keyof Q]?: QueueScheduler;
  },
  queueEvents: {
    [K in keyof Q]?: QueueEvents;
  }
};

export function QueueManager<Q extends Record<string, QueueManagerEntity>>(opt: QueueManagerTypeOptions<Q>): QueueManagerReturn<Q> {

  const connection = createRedisClient('new');

  const queues: Record<string, Queue> = {};
  const workers: Record<string, Worker> = {};
  const queueSchedulers: Record<string, QueueScheduler> = {};
  const queueEvents: Record<string, QueueEvents> = {};

  Object.entries(opt.queues).forEach(([key, q]) => {
    queues[key] = new Queue(key, { connection, ...q.queueOptions });

    if (opt.useQueueSchedulers && q.useQueueScheduler) {
      const connection = createRedisClient('new');
      const opts = typeof q.useQueueScheduler != 'boolean' ? q.useQueueScheduler : {};
      queueSchedulers[key] = new QueueScheduler(key, { connection, ...opts });
    }

    if (opt.useQueueEvent && q.useQueueEvent) {
      const connection = createRedisClient('new');
      const opts = typeof q.useQueueEvent != 'boolean' ? q.useQueueEvent : {};
      queueEvents[key] = new QueueEvents(key, { connection, ...opts });
    }

    const processor = q.processor || opt.processors?.[key];
    if (opt.useWorkers && processor) {
      const p = processor;
      workers[key] = new Worker(key, p, { connection, ...q.workerOptions });
    }
  
    if (opt.useRepeatableJobs && q.repeatableJobs) {
      queues[key].addBulk(q.repeatableJobs)
        .catch(err => {
          console.error(`Failed to add repeatable jobs for queue '${key}'!`, err);
        })
    }
  })

  return {
    queues,
    workers,
    queueSchedulers,
    queueEvents,
  } as any;
}