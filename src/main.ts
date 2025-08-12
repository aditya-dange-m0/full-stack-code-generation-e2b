import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
 
async function main() {
  const app = await NestFactory.create(AppModule);
 
  const config = new DocumentBuilder()
    .setTitle('Chat API')
    .setDescription('The chat API description')
    .setVersion('1.0')
    .addTag('chat')
    .addBearerAuth()
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);
 
  await app.listen(process.env.PORT || 4000);
}
 
void main();