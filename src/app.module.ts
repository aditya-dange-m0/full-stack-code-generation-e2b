import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SandboxService } from './sandbox/sandbox.service';
import { SandboxModule } from './sandbox/sandbox.module';
import { ConfigModule } from '@nestjs/config';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SandboxModule,
  ],
  controllers: [AppController],
  providers: [AppService, SandboxService],
})
export class AppModule {}
