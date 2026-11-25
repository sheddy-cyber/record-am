// Native: the real swipeable pager. (Pager.web.tsx provides the web fallback.)
import React from 'react';
import PagerView, { PagerViewProps } from 'react-native-pager-view';

export type PagerHandle = { setPageWithoutAnimation: (index: number) => void };

const Pager = PagerView as unknown as React.ForwardRefExoticComponent<
  PagerViewProps & React.RefAttributes<PagerHandle>
>;

export default Pager;
