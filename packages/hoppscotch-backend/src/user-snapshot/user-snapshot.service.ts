import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Snapshot } from './snapshot.model';
import { ReqType } from 'src/types/RequestTypes';
import * as E from 'fp-ts/Either';
import * as O from 'fp-ts/Option';
import {
  SNAPSHOT_SIZE_LIMIT_EXCEEDED,
  SNAPSHOT_LIMIT_REACHED,
  SNAPSHOT_NOT_FOUND,
} from '../errors';

const MAX_SNAPSHOTS_PER_USER = 50;
const MAX_RESPONSE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

@Injectable()
export class UserSnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a snapshot with size validation and auto-eviction.
   */
  async createSnapshot(
    uid: string,
    requestKey: string,
    reqData: string,
    responseData: string,
    reqType: ReqType,
    isManual: boolean,
  ): Promise<E.Either<string, Snapshot>> {
    // Parse and validate response size
    const parsedResponse = JSON.parse(responseData);
    if (parsedResponse.body) {
      const bodySize = Buffer.from(parsedResponse.body, 'base64').length;
      if (bodySize > MAX_RESPONSE_SIZE_BYTES) {
        return E.left(SNAPSHOT_SIZE_LIMIT_EXCEEDED);
      }
    }

    // Check snapshot count and evict if needed
    const count = await this.prisma.snapshot.count({ where: { userUid: uid } });
    if (count >= MAX_SNAPSHOTS_PER_USER) {
      // Evict oldest auto-captured snapshot first
      const oldestAuto = await this.prisma.snapshot.findFirst({
        where: { userUid: uid, isManual: false },
        orderBy: { createdAt: 'asc' },
      });

      if (oldestAuto) {
        await this.prisma.snapshot.delete({ where: { id: oldestAuto.id } });
      } else if (!isManual) {
        // All snapshots are manual, refuse new auto-capture
        return E.left(SNAPSHOT_LIMIT_REACHED);
      } else {
        // Manual snapshot requested but quota full—evict oldest manual (FIFO)
        const oldestManual = await this.prisma.snapshot.findFirst({
          where: { userUid: uid, isManual: true },
          orderBy: { createdAt: 'asc' },
        });
        if (oldestManual) {
          await this.prisma.snapshot.delete({ where: { id: oldestManual.id } });
        }
      }
    }

    const snapshot = await this.prisma.snapshot.create({
      data: {
        userUid: uid,
        requestKey,
        reqType,
        request: JSON.parse(reqData),
        responseData: parsedResponse,
        isManual,
      },
    });

    return E.right({
      ...snapshot,
      request: JSON.stringify(snapshot.request),
      responseData: JSON.stringify(snapshot.responseData),
    } as Snapshot);
  }

  /**
   * Fetch snapshots for a user, optionally filtered by requestKey.
   */
  async fetchSnapshots(
    uid: string,
    requestKey?: string,
    limit: number = 50,
  ): Promise<Snapshot[]> {
    const snapshots = await this.prisma.snapshot.findMany({
      where: {
        userUid: uid,
        ...(requestKey && { requestKey }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return snapshots.map((s) => ({
      ...s,
      request: JSON.stringify(s.request),
      responseData: JSON.stringify(s.responseData),
    })) as Snapshot[];
  }

  /**
   * Get the most recent snapshot for a specific requestKey (the "previous" execution).
   */
  async getPreviousSnapshot(
    uid: string,
    requestKey: string,
  ): Promise<O.Option<Snapshot>> {
    const snapshot = await this.prisma.snapshot.findFirst({
      where: { userUid: uid, requestKey },
      orderBy: { createdAt: 'desc' },
    });

    if (!snapshot) return O.none;

    return O.some({
      ...snapshot,
      request: JSON.stringify(snapshot.request),
      responseData: JSON.stringify(snapshot.responseData),
    } as Snapshot);
  }

  /**
   * Delete a specific snapshot.
   */
  async deleteSnapshot(uid: string, id: string): Promise<E.Either<string, Snapshot>> {
    const snapshot = await this.prisma.snapshot.findFirst({
      where: { id, userUid: uid },
    });

    if (!snapshot) return E.left(SNAPSHOT_NOT_FOUND);

    await this.prisma.snapshot.delete({ where: { id } });

    return E.right({
      ...snapshot,
      request: JSON.stringify(snapshot.request),
      responseData: JSON.stringify(snapshot.responseData),
    } as Snapshot);
  }

  /**
   * Delete all snapshots for a user, optionally filtered by requestKey.
   */
  async deleteAllSnapshots(uid: string, requestKey?: string): Promise<number> {
    const result = await this.prisma.snapshot.deleteMany({
      where: {
        userUid: uid,
        ...(requestKey && { requestKey }),
      },
    });

    return result.count;
  }
}
