// Web: no swipe pager available, so show the selected page and keep the
// others mounted (hidden) to preserve their state, like the native pager.
import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

export type PagerHandle = { setPageWithoutAnimation: (index: number) => void };

type Props = {
  style?: StyleProp<ViewStyle>;
  initialPage?: number;
  onPageSelected?: (e: { nativeEvent: { position: number } }) => void;
  children: React.ReactNode;
  offscreenPageLimit?: number;
  overdrag?: boolean;
};

const WebPager = forwardRef<PagerHandle, Props>(function WebPager({ style, initialPage = 0, onPageSelected, children }, ref) {
  const [page, setPage] = useState(initialPage);
  useImperativeHandle(ref, () => ({
    setPageWithoutAnimation: (index: number) => {
      setPage(index);
      onPageSelected?.({ nativeEvent: { position: index } });
    },
  }));
  return (
    <View style={style}>
      {React.Children.map(children, (child, i) => (
        <View style={{ flex: 1, display: i === page ? 'flex' : 'none' }}>{child}</View>
      ))}
    </View>
  );
});

export default WebPager;
