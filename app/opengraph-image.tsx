import {
  SOCIAL_IMAGE_ALT,
  SOCIAL_IMAGE_SIZE,
  SOCIAL_IMAGE_TYPE,
  socialImageResponse,
} from '@/lib/social-image';

export const alt = SOCIAL_IMAGE_ALT;
export const size = SOCIAL_IMAGE_SIZE;
export const contentType = SOCIAL_IMAGE_TYPE;

export default function OpengraphImage() {
  return socialImageResponse();
}
