import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UserSnapshotService } from './user-snapshot.service';
import { Snapshot, SnapshotDeletedManyData } from './snapshot.model';
import { ReqType } from 'src/types/RequestTypes';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from '../guards/gql-auth.guard';
import { GqlUser } from '../decorators/gql-user.decorator';
import { User } from '../user/user.model';
import { throwErr } from '../utils';
import * as E from 'fp-ts/Either';
import * as O from 'fp-ts/Option';
import { GqlThrottlerGuard } from 'src/guards/gql-throttler.guard';

@UseGuards(GqlThrottlerGuard)
@Resolver()
export class UserSnapshotResolver {
  constructor(private readonly snapshotService: UserSnapshotService) {}

  /* Mutations */

  @Mutation(() => Snapshot, {
    description: 'Creates a new snapshot of a request/response execution',
  })
  @UseGuards(GqlAuthGuard)
  async createSnapshot(
    @GqlUser() user: User,
    @Args({ name: 'requestKey', description: 'Request identifier (endpoint_method)' })
    requestKey: string,
    @Args({ name: 'reqData', description: 'JSON string of the request data' })
    reqData: string,
    @Args({ name: 'responseData', description: 'JSON string of the response data' })
    responseData: string,
    @Args({ name: 'reqType', type: () => ReqType })
    reqType: ReqType,
    @Args({ name: 'isManual', type: () => Boolean, defaultValue: false })
    isManual: boolean,
  ): Promise<Snapshot> {
    const result = await this.snapshotService.createSnapshot(
      user.uid,
      requestKey,
      reqData,
      responseData,
      reqType,
      isManual,
    );
    if (E.isLeft(result)) throwErr(result.left);
    return result.right;
  }

  @Mutation(() => Snapshot, {
    description: 'Deletes a specific snapshot by ID',
  })
  @UseGuards(GqlAuthGuard)
  async deleteSnapshot(
    @GqlUser() user: User,
    @Args({ name: 'id', type: () => ID })
    id: string,
  ): Promise<Snapshot> {
    const result = await this.snapshotService.deleteSnapshot(user.uid, id);
    if (E.isLeft(result)) throwErr(result.left);
    return result.right;
  }

  @Mutation(() => SnapshotDeletedManyData, {
    description: 'Deletes all snapshots, optionally filtered by requestKey',
  })
  @UseGuards(GqlAuthGuard)
  async deleteAllSnapshots(
    @GqlUser() user: User,
    @Args({ name: 'requestKey', nullable: true })
    requestKey?: string,
  ): Promise<SnapshotDeletedManyData> {
    const count = await this.snapshotService.deleteAllSnapshots(user.uid, requestKey);
    return { count };
  }

  /* Queries */

  @Query(() => [Snapshot], {
    description: 'Fetches snapshots for the current user, optionally filtered by requestKey',
  })
  @UseGuards(GqlAuthGuard)
  async snapshots(
    @GqlUser() user: User,
    @Args({ name: 'requestKey', nullable: true })
    requestKey?: string,
    @Args({ name: 'limit', type: () => Number, defaultValue: 50 })
    limit?: number,
  ): Promise<Snapshot[]> {
    return this.snapshotService.fetchSnapshots(user.uid, requestKey, limit);
  }

  @Query(() => Snapshot, {
    description: 'Gets the most recent snapshot for a requestKey (the "previous" execution)',
    nullable: true,
  })
  @UseGuards(GqlAuthGuard)
  async previousSnapshot(
    @GqlUser() user: User,
    @Args({ name: 'requestKey' })
    requestKey: string,
  ): Promise<Snapshot | null> {
    const result = await this.snapshotService.getPreviousSnapshot(user.uid, requestKey);
    return O.isSome(result) ? result.value : null;
  }
}
