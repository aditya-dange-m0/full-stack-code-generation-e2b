import { Module } from '@nestjs/common';
import { SandboxService } from './sandbox.service';
import { SandboxController } from './sandbox.controller';

@Module({
  providers: [SandboxService],
  controllers: [SandboxController],
  exports: [SandboxService], // Export SandboxService so it can be used in other modules
})
export class SandboxModule {}
