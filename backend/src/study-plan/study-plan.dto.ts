import {IsInt, IsOptional, Matches, Max, Min} from 'class-validator';

export class GenerateStudyPlanDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  days?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute?: number;
}

export class RescheduleStudySessionDto {
  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute!: number;

  // ISO calendar date: YYYY-MM-DD
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
}
