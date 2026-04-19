#ifndef CC_TYPES_H
#define CC_TYPES_H

struct CcExternalPoint {
  int x;
  int y;
};

struct CcExternalRect {
  CcExternalPoint origin;
  int width;
  int height;
};

#endif
