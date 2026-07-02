import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';
import { UserSnapshotService } from './user-snapshot.service';
import { UserSnapshotResolver } from './user-snapshot.resolver';

@Module({
  imports: [UserModule],
  providers: [UserSnapshotService, UserSnapshotResolver],
  exports: [UserSnapshotService],
})
export class UserSnapshotModule {}
