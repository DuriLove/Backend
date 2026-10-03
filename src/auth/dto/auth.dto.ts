import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class SignupDto {
  @ApiProperty({ example: '수민' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Matches(/\S/)
  name!: string;

  @ApiProperty({ example: 'sumin@duri.local' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'sumin@duri.local' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password!: string;
}
