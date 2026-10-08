import {ArrayNotEmpty, ArrayUnique, IsArray, IsIn, IsInt} from 'class-validator';

export class PreferencesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(['read', 'listen', 'visual', 'practice'], {each: true})
  formats!: ('read' | 'listen' | 'visual' | 'practice')[];

  @IsIn(['spaced', 'longBlocks'])
  rhythm!: 'spaced' | 'longBlocks';

  @IsInt()
  @IsIn([15, 25, 40])
  minutesPerDay!: 15 | 25 | 40;

  @IsIn(['exam', 'understand', 'habit'])
  goal!: 'exam' | 'understand' | 'habit';
}
