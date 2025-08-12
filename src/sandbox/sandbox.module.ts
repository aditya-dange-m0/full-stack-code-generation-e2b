import { Module } from '@nestjs/common';
import { SandboxService } from './sandbox.service';
import { SandboxController } from './sandbox.controller';

@Module({
  providers: [SandboxService],
  controllers: [SandboxController]
})
export class SandboxModule {}
