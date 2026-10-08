import {IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength} from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, {message: 'name must contain a non-whitespace character'})
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password!: string;
}

export class GoogleLoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8192)
  idToken!: string;
}
