import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'nx:isPublic';

/** Opt a route out of authentication. Everything else is denied by default. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
