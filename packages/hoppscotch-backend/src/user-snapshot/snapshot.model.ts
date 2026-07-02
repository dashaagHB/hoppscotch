import { Field, ID, ObjectType } from '@nestjs/graphql';
import { ReqType } from 'src/types/RequestTypes';

@ObjectType()
export class Snapshot {
  @Field(() => ID)
  id: string;

  @Field()
  userUid: string;

  @Field()
  requestKey: string;

  @Field(() => ReqType)
  reqType: ReqType;

  @Field()
  request: string; // JSON stringified

  @Field()
  responseData: string; // JSON stringified { body: base64, headers: [], statusCode, duration }

  @Field()
  isManual: boolean;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

@ObjectType()
export class SnapshotDeletedManyData {
  @Field()
  count: number;
}
